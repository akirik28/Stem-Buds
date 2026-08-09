import './load-env';
import { closeDb, getDb } from '../src/server/db';
import { getEnv } from '../src/server/env';
import { ensureCorePrograms } from '../src/server/services/program-service';
import { createUser, executiveExists } from '../src/server/services/user-admin';
import { AUDIT_ACTIONS, recordAudit } from '../src/server/services/audit';

async function main(): Promise<void> {
  const env = getEnv();
  const db = getDb();
  await ensureCorePrograms(db);

  if (await executiveExists(db)) {
    console.log('An Executive account already exists; first-deploy bootstrap skipped.');
    return;
  }

  if (!env.INITIAL_EXECUTIVE_USERNAME || !env.INITIAL_EXECUTIVE_NAME || !env.INITIAL_EXECUTIVE_PASSWORD) {
    throw new Error(
      'INITIAL_EXECUTIVE_USERNAME, INITIAL_EXECUTIVE_NAME and INITIAL_EXECUTIVE_PASSWORD are required for the first deployment.',
    );
  }

  const created = await createUser({
    username: env.INITIAL_EXECUTIVE_USERNAME,
    fullName: env.INITIAL_EXECUTIVE_NAME,
    role: 'regional_director',
    notificationEmail: env.INITIAL_EXECUTIVE_EMAIL ?? null,
    temporaryPassword: env.INITIAL_EXECUTIVE_PASSWORD,
    actor: { id: null, name: 'deployment-bootstrap' },
  });

  await recordAudit({
    actorUserId: null,
    actorName: 'deployment-bootstrap',
    action: AUDIT_ACTIONS.bootstrapExecutiveCreated,
    targetType: 'user',
    targetId: created.userId,
    targetLabel: created.username,
    after: { role: 'regional_director' },
  });

  console.log('Initial Executive account created; no credential was written to the build log.');
}

main()
  .catch(() => {
    console.error('First-deploy bootstrap failed. Check the required production environment variables.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
