import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { sessions, users } from '@/server/db/schema';
import { getEnv } from '@/server/env';

/**
 * Server-side session management.
 *
 * The cookie carries `<sessionId>.<secret>`. Only a SHA-256 digest of the secret
 * is stored, so a database dump cannot be replayed as a valid session.
 */

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const SESSION_REFRESH_AFTER_MS = 1000 * 60 * 60; // touch `lastUsedAt` at most hourly

export type SessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: (typeof users.$inferSelect)['role'];
  mustChangePassword: boolean;
  notificationEmail: string | null;
};

export type ActiveSession = {
  sessionId: string;
  user: SessionUser;
};

function digest(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function sessionCookieName(): string {
  return getEnv().SESSION_COOKIE_NAME;
}

export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: getEnv().SESSION_COOKIE_SECURE,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

/** Creates a session row and returns the opaque cookie value. */
export async function createSession(
  userId: string,
  context: { userAgent?: string | null; ipHash?: string | null } = {},
): Promise<string> {
  const db = getDb();
  const secret = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [row] = await db
    .insert(sessions)
    .values({
      userId,
      secretHash: digest(secret),
      expiresAt,
      userAgent: context.userAgent?.slice(0, 300) ?? null,
      ipHash: context.ipHash ?? null,
    })
    .returning({ id: sessions.id });

  if (!row) throw new Error('Session could not be created');
  return `${row.id}.${secret}`;
}

/**
 * Validates a cookie value. Returns null for anything unusable: malformed,
 * unknown, expired, or belonging to a deactivated account.
 */
export async function validateSessionToken(token: string | undefined): Promise<ActiveSession | null> {
  if (!token) return null;

  const separatorIndex = token.indexOf('.');
  if (separatorIndex <= 0) return null;

  const sessionId = token.slice(0, separatorIndex);
  const secret = token.slice(separatorIndex + 1);
  if (!secret) return null;

  // A malformed uuid would make Postgres raise instead of returning no rows.
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;

  const db = getDb();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      secretHash: sessions.secretHash,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      userId: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      notificationEmail: users.notificationEmail,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;
  if (row.secretHash !== digest(secret)) return null;
  if (!row.isActive) return null;

  if (Date.now() - row.lastUsedAt.getTime() > SESSION_REFRESH_AFTER_MS) {
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    user: {
      id: row.userId,
      username: row.username,
      fullName: row.fullName,
      role: row.role,
      mustChangePassword: row.mustChangePassword,
      notificationEmail: row.notificationEmail,
    },
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.id, sessionId));
}

/** Invalidates every session of a user — used after an administrative reset. */
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Invalidates every session of a user except the one making the request, so a
 * password change signs other devices out without signing the caller out here.
 */
export async function destroyOtherSessionsForUser(
  userId: string,
  keepSessionId: string,
): Promise<void> {
  await getDb()
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, keepSessionId)));
}

/** Housekeeping for the scheduled job runner. */
export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await getDb()
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id });
  return deleted.length;
}
