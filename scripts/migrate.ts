import './load-env';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb } from '../src/server/db';

async function main(): Promise<void> {
  const db = getDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations applied.');
  await closeDb();
}

main().catch(async (error: unknown) => {
  console.error('Migration failed:', error);
  await closeDb().catch(() => undefined);
  process.exit(1);
});
