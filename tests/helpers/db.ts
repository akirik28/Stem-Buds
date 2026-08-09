import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, getDb } from '@/server/db';
import { getEnv } from '@/server/env';
import { ensureCorePrograms } from '@/server/services/program-service';

/**
 * Integration-test database helpers.
 *
 * The suite runs against a dedicated database (TEST_DATABASE_URL). Every test
 * file resets it to a known-empty state, which keeps tests deterministic
 * regardless of execution order.
 */

let migrated = false;

export async function ensureMigrated(): Promise<void> {
  const env = getEnv();
  if (!env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be configured for integration tests.');
  }
  if (migrated) return;
  await migrate(getDb(), { migrationsFolder: './drizzle' });
  migrated = true;
}

/** Empties every application table without dropping the schema. */
export async function truncateAll(): Promise<void> {
  const db = getDb();
  const tables = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'
  `);

  const names = tables.map((row) => `"public"."${row.tablename}"`);
  if (names.length === 0) return;

  await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(', ')} RESTART IDENTITY CASCADE`));
}

/**
 * Resets the test database to a clean, known-empty state — plus the two core
 * programs, which are reference data expected to exist in every real
 * environment (production included), not test fixtures. Individual tests
 * still create their own chapters, groups, users, etc.
 */
export async function resetDatabase(): Promise<void> {
  await ensureMigrated();
  await truncateAll();
  await ensureCorePrograms();
}

export async function closeTestDb(): Promise<void> {
  await closeDb();
  migrated = false;
}
