import './load-env';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { users } from '../src/server/db/schema';
import { createSession, sessionCookieName } from '../src/server/auth/session';

/**
 * Development helper: mints a real session for a demo account so the
 * authenticated UI can be exercised without driving the login form.
 * Refuses to run against anything but a local database.
 */
async function main(): Promise<void> {
  const host = new URL(process.env.DATABASE_URL ?? '').hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to mint a session against a non-local database (host: ${host}).`);
  }
  const username = process.argv[2];
  if (!username) throw new Error('Usage: tsx scripts/dev-session.ts <username>');

  const [user] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) throw new Error(`No such user: ${username}`);

  const token = await createSession(user.id, { userAgent: 'dev-session', ipHash: null });
  console.log(JSON.stringify({ cookie: sessionCookieName(), token, role: user.role }));
}

main()
  .catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(async () => { await closeDb().catch(() => undefined); });
