import './load-env';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { users } from '../src/server/db/schema';
import { resetTemporaryPassword } from '../src/server/services/user-admin';

/**
 * Issues a new temporary password for an account.
 *
 * Listing users first, without a `--username`, is the point: someone locked
 * out of a fresh deployment usually does not know which account the
 * bootstrap created, so the command that fixes it also tells them.
 */
async function main() {
  const { values } = parseArgs({ options: { username: { type: 'string' } } });
  const db = getDb();

  if (!values.username) {
    const rows = await db.select({ username: users.username, fullName: users.fullName, role: users.role }).from(users);
    console.log('Hesaplar:');
    for (const row of rows) console.log(`  ${row.username}  —  ${row.fullName} (${row.role})`);
    console.log('\nŞifre sıfırlamak için: npx tsx scripts/reset-password.ts --username <kullanıcı adı>');
    return;
  }

  const [target] = await db.select().from(users).where(eq(users.username, values.username)).limit(1);
  if (!target) {
    console.log(`"${values.username}" adlı kullanıcı yok.`);
    process.exitCode = 1;
    return;
  }

  const result = await resetTemporaryPassword({
    targetUserId: target.id,
    actor: { id: null, name: 'cli' },
  });

  console.log(`\nKullanıcı adı : ${result.username}`);
  console.log(`Geçici şifre  : ${result.temporaryPassword}`);
  console.log('\nBu şifre bir daha gösterilmeyecek. İlk girişte değiştirmeniz istenecek.');
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeDb());
