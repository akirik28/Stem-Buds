import './load-env';
import { parseArgs } from 'node:util';
import { closeDb, getDb } from '../src/server/db';
import { getEnv } from '../src/server/env';
import { safeCompare } from '../src/server/auth/password';
import { createUser, executiveExists } from '../src/server/services/user-admin';
import { AUDIT_ACTIONS, recordAudit } from '../src/server/services/audit';
import type { UserRole } from '../src/server/authz/policy';

/**
 * Creates the very first Executive Management account.
 *
 * Safety properties:
 *  - it is a CLI script, never an HTTP endpoint, so it cannot be abused as an
 *    open registration route;
 *  - it refuses to run once any executive exists, so it cannot stay open
 *    forever and repeating it fails safely;
 *  - when BOOTSTRAP_TOKEN is set (required in production) the same value must
 *    be passed with --token;
 *  - the temporary password is printed once and never stored.
 */

const EXECUTIVE_ROLES: UserRole[] = ['regional_director', 'co_director', 'vice_president'];

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'regional_director' },
      email: { type: 'string' },
      token: { type: 'string' },
    },
  });

  const env = getEnv();

  if (env.NODE_ENV === 'production' && !env.BOOTSTRAP_TOKEN) {
    fail('BOOTSTRAP_TOKEN must be set in production before running the bootstrap.');
  }

  if (env.BOOTSTRAP_TOKEN) {
    if (!values.token || !safeCompare(values.token, env.BOOTSTRAP_TOKEN)) {
      fail('Invalid or missing --token. It must match BOOTSTRAP_TOKEN.');
    }
  }

  if (!values.username || !values.name) {
    fail(
      'Usage: npm run bootstrap:executive -- --username <username> --name "<Ad Soyad>" [--role regional_director|co_director|vice_president] [--email <address>] [--token <BOOTSTRAP_TOKEN>]',
    );
  }

  const role = values.role as UserRole;
  if (!EXECUTIVE_ROLES.includes(role)) {
    fail(`--role must be one of: ${EXECUTIVE_ROLES.join(', ')}`);
  }

  const db = getDb();

  if (await executiveExists(db)) {
    console.error(
      'An Executive Management account already exists. Bootstrap is closed; create further accounts from the admin UI.',
    );
    await closeDb();
    process.exit(1);
  }

  const created = await createUser({
    username: values.username,
    fullName: values.name,
    role,
    notificationEmail: values.email ?? null,
    actor: { id: null, name: 'bootstrap-cli' },
  });

  await recordAudit({
    actorUserId: null,
    actorName: 'bootstrap-cli',
    action: AUDIT_ACTIONS.bootstrapExecutiveCreated,
    targetType: 'user',
    targetId: created.userId,
    targetLabel: created.username,
    after: { role },
  });

  console.log('');
  console.log('  Executive account created.');
  console.log('  ------------------------------------------');
  console.log(`  Kullanıcı adı : ${created.username}`);
  console.log(`  Geçici şifre  : ${created.temporaryPassword}`);
  console.log('  ------------------------------------------');
  console.log('  This password is shown once and is not stored anywhere.');
  console.log('  The user must replace it at first login.');
  console.log('');

  await closeDb();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch(async (error: unknown) => {
  console.error('Bootstrap failed:', error instanceof Error ? error.message : error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
