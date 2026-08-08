import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { users } from '@/server/db/schema';
import { AppError, rateLimited, validationError } from '@/server/errors';
import { messages } from '@/lib/i18n/tr';
import {
  checkPasswordPolicy,
  hashPassword,
  verifyPassword,
  type PasswordPolicyFailure,
} from '@/server/auth/password';
import { createSession, destroyOtherSessionsForUser } from '@/server/auth/session';
import { consumeRateLimit, resetRateLimit } from './rate-limit';
import { AUDIT_ACTIONS, recordAudit } from './audit';

const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LOCK_THRESHOLD = 8;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

export const passwordPolicyMessages: Record<PasswordPolicyFailure, string> = {
  too_short: messages.auth.passwordTooShort,
  too_long: messages.auth.passwordTooLong,
  needs_letter: messages.auth.passwordNeedsLetter,
  needs_number: messages.auth.passwordNeedsNumber,
  same_as_username: messages.auth.passwordSameAsUsername,
};

/**
 * A real argon2id hash of a value nobody can log in with, computed once and
 * reused so a request for a non-existent username costs the same as a request
 * for a real one. Without it, response time would reveal which accounts exist.
 */
let decoyHashPromise: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHashPromise ??= hashPassword(`decoy-${Math.random()}-${Date.now()}`);
  return decoyHashPromise;
}

export type LoginInput = {
  username: string;
  password: string;
  ipHash: string | null;
  userAgent: string | null;
};

export type LoginResult = {
  sessionToken: string;
  mustChangePassword: boolean;
};

/**
 * Username-first login.
 *
 * Failure is reported with one generic Turkish message so the form cannot be
 * used to discover which usernames exist.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const username = input.username.trim().toLocaleLowerCase('tr');
  if (username.length === 0 || input.password.length === 0) {
    throw new AppError('validation', messages.auth.invalidCredentials);
  }

  const ipBucket = `login:ip:${input.ipHash ?? 'unknown'}`;
  const userBucket = `login:user:${username}`;
  const [ipLimit, userLimit] = await Promise.all([
    consumeRateLimit(ipBucket, LOGIN_ATTEMPT_LIMIT * 3, LOGIN_ATTEMPT_WINDOW_MS),
    consumeRateLimit(userBucket, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW_MS),
  ]);
  if (!ipLimit.allowed || !userLimit.allowed) throw rateLimited();

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = ${username}`)
    .limit(1);

  if (!user) {
    await verifyPassword(await getDecoyHash(), input.password);
    throw new AppError('validation', messages.auth.invalidCredentials);
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw new AppError('rate_limited', messages.auth.accountLocked);
  }

  const passwordMatches = await verifyPassword(user.passwordHash, input.password);

  if (!passwordMatches) {
    const failedCount = user.failedLoginCount + 1;
    await db
      .update(users)
      .set({
        failedLoginCount: failedCount,
        lockedUntil:
          failedCount >= ACCOUNT_LOCK_THRESHOLD ? new Date(Date.now() + ACCOUNT_LOCK_MS) : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    throw new AppError('validation', messages.auth.invalidCredentials);
  }

  if (!user.isActive) {
    throw new AppError('forbidden', messages.auth.accountInactive);
  }

  await db
    .update(users)
    .set({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  await resetRateLimit(userBucket);

  const sessionToken = await createSession(user.id, {
    userAgent: input.userAgent,
    ipHash: input.ipHash,
  });

  return { sessionToken, mustChangePassword: user.mustChangePassword };
}

export type ChangePasswordInput = {
  userId: string;
  currentSessionId: string;
  currentPassword: string | null;
  newPassword: string;
  newPasswordRepeat: string;
};

/**
 * Replaces the caller's own password.
 *
 * `currentPassword` is required unless the user is still on the temporary
 * password issued to them, which they have just proven by signing in.
 */
export async function changeOwnPassword(input: ChangePasswordInput): Promise<void> {
  if (input.newPassword !== input.newPasswordRepeat) {
    throw validationError(messages.auth.passwordsDoNotMatch);
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user) throw validationError(messages.common.unknownError);

  if (!user.mustChangePassword) {
    if (!input.currentPassword) throw validationError(messages.validation.requiredField);
    const matches = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!matches) throw validationError(messages.auth.invalidCredentials);
  }

  const policy = checkPasswordPolicy(input.newPassword, user.username);
  if (!policy.ok) throw validationError(passwordPolicyMessages[policy.reason]);

  const alreadyUsed = await verifyPassword(user.passwordHash, input.newPassword);
  if (alreadyUsed) {
    throw validationError('Yeni şifre mevcut şifrenden farklı olmalı.');
  }

  const passwordHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // The audit records that a password changed; the password itself never is.
    await recordAudit(
      {
        actorUserId: user.id,
        actorName: user.fullName,
        action: AUDIT_ACTIONS.passwordChanged,
        targetType: 'user',
        targetId: user.id,
        targetLabel: user.username,
      },
      tx,
    );
  });

  await destroyOtherSessionsForUser(user.id, input.currentSessionId);
}
