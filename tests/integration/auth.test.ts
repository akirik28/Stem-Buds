import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { auditLogs, sessions, users } from '@/server/db/schema';
import { createUser, executiveExists, resetTemporaryPassword } from '@/server/services/user-admin';
import { changeOwnPassword, login } from '@/server/services/auth-service';
import { validateSessionToken } from '@/server/auth/session';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDb();
});

async function createStudentAccount() {
  return createUser({
    username: 'ogrenci.deneme',
    fullName: 'Deneme Öğrenci',
    role: 'regional_director',
    actor,
  });
}

describe('account creation', () => {
  it('issues a temporary password that is never stored in the database', async () => {
    const created = await createStudentAccount();
    expect(created.temporaryPassword).toHaveLength(12);

    const [row] = await getDb().select().from(users).where(eq(users.id, created.userId));
    expect(row).toBeDefined();
    expect(row?.passwordHash).not.toContain(created.temporaryPassword);
    expect(row?.mustChangePassword).toBe(true);

    // The plaintext must not appear anywhere in the database.
    const matches = await getDb().execute<{ hit: string }>(sql`
      SELECT column_name AS hit FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'users'
        AND data_type IN ('text', 'character varying')
    `);
    for (const column of matches) {
      const found = await getDb().execute<{ count: string }>(
        sql.raw(
          `SELECT count(*)::text AS count FROM public.users WHERE "${column.hit}" = '${created.temporaryPassword}'`,
        ),
      );
      expect(found[0]?.count).toBe('0');
    }
  });

  it('records an audit entry that contains no password', async () => {
    const created = await createStudentAccount();
    const logs = await getDb().select().from(auditLogs);
    const entry = logs.find((log) => log.action === 'user.created');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain(created.temporaryPassword);
  });

  it('rejects a duplicate username', async () => {
    await createStudentAccount();
    await expect(createStudentAccount()).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'conflict',
    );
  });

  it('rejects a malformed username', async () => {
    await expect(
      createUser({ username: 'Ad Soyad!', fullName: 'Test', role: 'regional_director', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('reports whether an executive already exists', async () => {
    expect(await executiveExists()).toBe(false);
    await createStudentAccount();
    expect(await executiveExists()).toBe(true);
  });
});

describe('first login and forced password change', () => {
  it('signs in with the temporary password and demands a replacement', async () => {
    const created = await createStudentAccount();

    const result = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    expect(result.mustChangePassword).toBe(true);

    const session = await validateSessionToken(result.sessionToken);
    expect(session?.user.username).toBe('ogrenci.deneme');
    expect(session?.user.mustChangePassword).toBe(true);
  });

  it('invalidates the temporary password once it has been replaced', async () => {
    const created = await createStudentAccount();
    const first = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    const session = await validateSessionToken(first.sessionToken);
    expect(session).not.toBeNull();

    await changeOwnPassword({
      userId: created.userId,
      currentSessionId: session!.sessionId,
      currentPassword: null,
      newPassword: 'YeniSifre2026',
      newPasswordRepeat: 'YeniSifre2026',
    });

    await expect(
      login({
        username: 'ogrenci.deneme',
        password: created.temporaryPassword,
        ipHash: null,
        userAgent: 'vitest',
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');

    const second = await login({
      username: 'ogrenci.deneme',
      password: 'YeniSifre2026',
      ipHash: null,
      userAgent: 'vitest',
    });
    expect(second.mustChangePassword).toBe(false);
  });

  it('rotates every session — including the current one — after a password change', async () => {
    const created = await createStudentAccount();
    const first = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'device-1',
    });
    const second = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'device-2',
    });

    const keep = await validateSessionToken(second.sessionToken);
    const result = await changeOwnPassword({
      userId: created.userId,
      currentSessionId: keep!.sessionId,
      currentPassword: null,
      newPassword: 'YeniSifre2026',
      newPasswordRepeat: 'YeniSifre2026',
    });

    // Both the other device and the original token for *this* device are
    // invalidated — the caller is expected to switch to the freshly issued one.
    expect(await validateSessionToken(first.sessionToken)).toBeNull();
    expect(await validateSessionToken(second.sessionToken)).toBeNull();

    const rotated = await validateSessionToken(result.sessionToken);
    expect(rotated).not.toBeNull();
    expect(rotated?.user.username).toBe('ogrenci.deneme');
    expect(rotated?.sessionId).not.toBe(keep!.sessionId);
  });

  it('refuses a new password that repeats the old one', async () => {
    const created = await createStudentAccount();
    const first = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    const session = await validateSessionToken(first.sessionToken);

    await expect(
      changeOwnPassword({
        userId: created.userId,
        currentSessionId: session!.sessionId,
        currentPassword: null,
        newPassword: created.temporaryPassword,
        newPasswordRepeat: created.temporaryPassword,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('login failures', () => {
  it('rejects a wrong password with a generic message', async () => {
    const created = await createStudentAccount();
    await expect(
      login({
        username: 'ogrenci.deneme',
        password: `${created.temporaryPassword}x`,
        ipHash: null,
        userAgent: 'vitest',
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.userMessage === 'Kullanıcı adı veya şifre hatalı.',
    );
  });

  it('gives the same message for an unknown username', async () => {
    await expect(
      login({ username: 'yok.boyle.biri', password: 'herhangi', ipHash: null, userAgent: 'vitest' }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.userMessage === 'Kullanıcı adı veya şifre hatalı.',
    );
  });

  it('refuses a deactivated account', async () => {
    const created = await createStudentAccount();
    await getDb().update(users).set({ isActive: false }).where(eq(users.id, created.userId));

    await expect(
      login({
        username: 'ogrenci.deneme',
        password: created.temporaryPassword,
        ipHash: null,
        userAgent: 'vitest',
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');
  });

  it('locks the account after repeated failures', async () => {
    const created = await createStudentAccount();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await expect(
        login({
          username: 'ogrenci.deneme',
          password: 'yanlis-sifre',
          ipHash: null,
          userAgent: 'vitest',
        }),
      ).rejects.toBeTruthy();
    }

    await expect(
      login({
        username: 'ogrenci.deneme',
        password: created.temporaryPassword,
        ipHash: null,
        userAgent: 'vitest',
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'rate_limited');
  });
});

describe('session validation', () => {
  it('rejects a tampered session secret', async () => {
    const created = await createStudentAccount();
    const result = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });

    const [id, secret] = result.sessionToken.split('.');
    expect(await validateSessionToken(`${id}.${secret}tampered`)).toBeNull();
    expect(await validateSessionToken('not-a-token')).toBeNull();
    expect(await validateSessionToken(undefined)).toBeNull();
  });

  it('stores only a digest of the session secret', async () => {
    const created = await createStudentAccount();
    const result = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    const secret = result.sessionToken.split('.').slice(1).join('.');

    const rows = await getDb().select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.secretHash).not.toBe(secret);
    expect(rows[0]?.secretHash).toHaveLength(64);
  });

  it('rejects an expired session', async () => {
    const created = await createStudentAccount();
    const result = await login({
      username: 'ogrenci.deneme',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });

    await getDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    expect(await validateSessionToken(result.sessionToken)).toBeNull();
  });
});

describe('administrative password reset', () => {
  it('issues a new temporary password and forces another change', async () => {
    const created = await createStudentAccount();
    const reset = await resetTemporaryPassword({
      targetUserId: created.userId,
      actor: { id: null, name: 'Ada Sarp Kırık' },
    });

    expect(reset.temporaryPassword).not.toBe(created.temporaryPassword);

    const result = await login({
      username: 'ogrenci.deneme',
      password: reset.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    expect(result.mustChangePassword).toBe(true);

    const logs = await getDb().select().from(auditLogs);
    const entry = logs.find((log) => log.action === 'user.password_reset_issued');
    expect(entry).toBeDefined();
    expect(JSON.stringify(entry)).not.toContain(reset.temporaryPassword);
  });
});
