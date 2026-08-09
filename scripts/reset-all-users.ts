import './load-env';
import { parseArgs } from 'node:util';
import { closeDb, getDb } from '../src/server/db';
import { getEnv } from '../src/server/env';
import { users } from '../src/server/db/schema';

/**
 * DANGEROUS. IRREVERSIBLE. Not run by the application, not run
 * automatically by anything, and never something to be executed on your
 * behalf without your own explicit, separate confirmation each time.
 *
 * Permanently deletes every row in `users` — bypassing the application's
 * own `deleteUser()` safety rule, which normally refuses to hard-delete
 * any account that has ever logged in. This script exists specifically
 * to bypass that rule when you have decided, deliberately, that you want
 * every account gone (e.g. clearing out development/QA accounts before a
 * real launch).
 *
 * What survives: every other table — chapters, groups, projects, audit
 * logs, messages, and so on. Every foreign key in this schema that points
 * at `users.id` is declared `ON DELETE CASCADE` or `ON DELETE SET NULL`
 * (verified against every such reference in `src/server/db/schema/*.ts`
 * before writing this script) — never `RESTRICT` — so this delete cannot
 * fail with a foreign-key error. Where a table already stores its own
 * name snapshot independent of the FK (e.g. `audit_logs.actorName`), that
 * snapshot survives even once the account it names is gone.
 *
 * What you lose: every relationship that *is* the user reference —
 * memberships (chapter/group/channel), sessions, and any
 * mentor/chapter-head/etc. assignment on a chapter or group. Those cannot
 * survive the user being gone; chapters and groups themselves remain, but
 * with those assignments cleared.
 *
 * Usage:
 *   npm run reset:all-users -- --confirm=DELETE-ALL-USERS
 *
 * Then, separately — this script does not create one for you — make your
 * own fresh account with the existing, already-safe bootstrap script:
 *   npm run bootstrap:executive -- --username <username> --name "<Full Name>" --role regional_director --token <BOOTSTRAP_TOKEN>
 */

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      confirm: { type: 'string' },
      'i-understand-production': { type: 'boolean', default: false },
    },
  });

  if (values.confirm !== 'DELETE-ALL-USERS') {
    console.error(
      'Refusing to run. This permanently deletes every user account. ' +
        'Re-run with --confirm=DELETE-ALL-USERS once you are certain.',
    );
    process.exit(1);
  }

  const env = getEnv();
  if (env.NODE_ENV === 'production' && !values['i-understand-production']) {
    console.error(
      'NODE_ENV=production and --i-understand-production was not passed. Refusing to run. ' +
        'Re-run with both --confirm=DELETE-ALL-USERS and --i-understand-production if this is ' +
        'genuinely intended against a production database.',
    );
    process.exit(1);
  }

  const db = getDb();
  const before = await db.select({ id: users.id }).from(users);
  console.log(`Deleting ${before.length} user account(s)...`);

  await db.delete(users);

  console.log('Done. Every user account has been permanently deleted.');
  console.log('Next: npm run bootstrap:executive -- --username <username> --name "<Full Name>" --role regional_director --token <BOOTSTRAP_TOKEN>');
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Reset failed:', error instanceof Error ? error.message : 'unknown error');
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
