import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb } from '@/server/db';
import { getEnv } from '@/server/env';

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

  const names = tables.rows.map((row) => `"public"."${row.tablename}"`);
  if (names.length === 0) return;

  await db.execute(sql.raw(`TRUNCATE TABLE ${names.join(', ')} RESTART IDENTITY CASCADE`));
}

export async function resetDatabase(): Promise<void> {
  await ensureMigrated();
  await truncateAll();
}

export async function closeTestDb(): Promise<void> {
  await closeDb();
  migrated = false;
}
