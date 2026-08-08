import { eq, inArray, sql } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { chapterMemberships, profiles, users } from '@/server/db/schema';
import { conflict, validationError } from '@/server/errors';
import { generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { EXECUTIVE_ROLES, type UserRole } from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * Account administration.
 *
 * There is no public self-registration: every account is created here by
 * Executive Management. The temporary password is returned to the caller
 * exactly once and never stored, e-mailed or audited.
 */

export type CreateUserInput = {
  username: string;
  fullName: string;
  role: UserRole;
  notificationEmail?: string | null;
  chapterId?: string | null;
  academicYearId?: string | null;
  actor: { id: string | null; name: string };
};

export type CreatedUser = {
  userId: string;
  username: string;
  /** Shown once, at creation time. Not persisted anywhere. */
  temporaryPassword: string;
};

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,62})[a-z0-9]$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLocaleLowerCase('tr');
}

export function assertValidUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw validationError(
      'Kullanıcı adı 3-64 karakter olmalı; yalnızca küçük harf, rakam, nokta, tire ve alt çizgi içerebilir.',
    );
  }
}

export async function createUser(input: CreateUserInput): Promise<CreatedUser> {
  const username = normalizeUsername(input.username);
  assertValidUsername(username);

  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw validationError('Ad soyad zorunludur.');

  if (input.role === 'chapter_head' || input.role === 'mentor' || input.role === 'student') {
    if (!input.chapterId || !input.academicYearId) {
      throw validationError('Bu rol için chapter ve akademik yıl seçilmelidir.');
    }
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const db = getDb();

  const userId = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${username}`)
      .limit(1);
    if (existing.length > 0) throw conflict('Bu kullanıcı adı zaten kullanılıyor.');

    const [created] = await tx
      .insert(users)
      .values({
        username,
        fullName,
        role: input.role,
        notificationEmail: input.notificationEmail?.trim() || null,
        passwordHash,
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    if (!created) throw conflict('Kullanıcı oluşturulamadı.');

    await tx.insert(profiles).values({ userId: created.id });

    if (input.chapterId && input.academicYearId) {
      await tx.insert(chapterMemberships).values({
        userId: created.id,
        chapterId: input.chapterId,
        academicYearId: input.academicYearId,
        role: input.role,
      });
    }

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.userCreated,
        targetType: 'user',
        targetId: created.id,
        targetLabel: username,
        chapterId: input.chapterId ?? null,
        academicYearId: input.academicYearId ?? null,
        after: { username, fullName, role: input.role },
      },
      tx,
    );

    return created.id;
  });

  return { userId, username, temporaryPassword };
}

/**
 * Issues a new temporary password. The issuance is audited; the password is not.
 */
export async function resetTemporaryPassword(input: {
  targetUserId: string;
  actor: { id: string | null; name: string };
}): Promise<{ username: string; temporaryPassword: string }> {
  const db = getDb();
  const [target] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!target) throw validationError('Kullanıcı bulunamadı.');

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.passwordResetIssued,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.username,
      },
      tx,
    );
  });

  return { username: target.username, temporaryPassword };
}

/** True when at least one Executive Management account exists. */
export async function executiveExists(db: Database = getDb()): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, [...EXECUTIVE_ROLES]))
    .limit(1);
  return rows.length > 0;
}
