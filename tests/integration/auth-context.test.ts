import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { createUser } from '@/server/services/user-admin';
import { login } from '@/server/services/auth-service';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * `requireAuthContext` is the server-side backstop behind every protected page
 * and mutation. These tests exercise it directly against cookie-less/mocked
 * `next/headers`, independent of any particular route.
 *
 * Each test re-imports `@/server/auth/context` after `vi.resetModules()` so
 * `getAuthContext`'s `cache()` wrapper (a per-request memoization primitive
 * that has no request boundary to key off of outside a real Next.js render)
 * starts fresh instead of replaying the first test's result forever. That
 * reset also duplicates the module graph, so `AppError` thrown from the
 * freshly-imported code is not `instanceof` the statically-imported class —
 * `hasErrorCode` below checks the `.code` field structurally instead of
 * relying on identity.
 */
function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === code
  );
}

const cookieStore = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
  }),
}));

const actor = { id: null, name: 'test-suite' };

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  cookieStore.clear();
  await resetDatabase();
  vi.resetModules();
});

afterAll(async () => {
  await closeTestDb();
});

async function importContext() {
  return import('@/server/auth/context');
}

async function importSession() {
  return import('@/server/auth/session');
}

describe('requireAuthContext — negative cases', () => {
  it('throws unauthenticated when there is no session cookie at all', async () => {
    const { requireAuthContext } = await importContext();
    await expect(requireAuthContext()).rejects.toSatisfy(
      (error: unknown) => hasErrorCode(error, 'unauthenticated'),
    );
  });

  it('throws unauthenticated for a cookie value that matches no session', async () => {
    const { requireAuthContext } = await importContext();
    const { sessionCookieName } = await importSession();
    cookieStore.set(sessionCookieName(), '00000000-0000-0000-0000-000000000000.bogus-secret');

    await expect(requireAuthContext()).rejects.toSatisfy(
      (error: unknown) => hasErrorCode(error, 'unauthenticated'),
    );
  });

  it('blocks a mutation-style call while the temporary password has not been replaced', async () => {
    const created = await createUser({
      username: 'gecici.hesap',
      fullName: 'Geçici Hesap',
      role: 'regional_director',
      actor,
    });
    const result = await login({
      username: 'gecici.hesap',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    expect(result.mustChangePassword).toBe(true);

    const { requireAuthContext } = await importContext();
    const { sessionCookieName } = await importSession();
    cookieStore.set(sessionCookieName(), result.sessionToken);

    await expect(requireAuthContext()).rejects.toSatisfy(
      (error: unknown) => hasErrorCode(error, 'forbidden'),
    );
  });

  it('allows the pending-password-change opt-out for the change-password flow itself', async () => {
    const created = await createUser({
      username: 'gecici.hesap2',
      fullName: 'Geçici Hesap',
      role: 'co_director',
      actor,
    });
    const result = await login({
      username: 'gecici.hesap2',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });

    const { requireAuthContext } = await importContext();
    const { sessionCookieName } = await importSession();
    cookieStore.set(sessionCookieName(), result.sessionToken);

    const context = await requireAuthContext({ allowPendingPasswordChange: true });
    expect(context.user.username).toBe('gecici.hesap2');
    expect(context.user.mustChangePassword).toBe(true);
  });

  it('grants access once the temporary password has been replaced', async () => {
    const created = await createUser({
      username: 'kalici.hesap',
      fullName: 'Kalıcı Hesap',
      role: 'vice_president',
      actor,
    });
    const { changeOwnPassword } = await import('@/server/services/auth-service');
    const first = await login({
      username: 'kalici.hesap',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    const { validateSessionToken } = await importSession();
    const session = await validateSessionToken(first.sessionToken);

    const changed = await changeOwnPassword({
      userId: created.userId,
      currentSessionId: session!.sessionId,
      currentPassword: null,
      newPassword: 'KaliciSifre2026',
      newPasswordRepeat: 'KaliciSifre2026',
    });

    const { requireAuthContext } = await importContext();
    const { sessionCookieName } = await importSession();
    cookieStore.set(sessionCookieName(), changed.sessionToken);

    const context = await requireAuthContext();
    expect(context.user.mustChangePassword).toBe(false);
  });
});

describe('database identity of the auth database', () => {
  it('is actually pointed at the dedicated test database', async () => {
    const { rows } = await getDb().execute<{ name: string }>(sql`select current_database() as name`);
    expect(rows[0]?.name).toBe('stembuds_test');
  });
});
