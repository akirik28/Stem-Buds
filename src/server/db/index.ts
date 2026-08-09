import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/server/env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * A single client is shared per process. Next.js re-evaluates modules on every
 * hot reload in development, so it is cached on `globalThis` to avoid leaking
 * connections.
 *
 * `prepare: false` is required against Supabase's transaction-mode pooler
 * (port 6543) — that mode does not support server-side prepared statements.
 * If `DATABASE_URL` instead points at a direct/session-mode connection
 * (port 5432, no pooler), `prepare: false` is still safe, just unnecessary.
 */
const globalForDb = globalThis as unknown as {
  __stembudsClient?: postgres.Sql;
  __stembudsDb?: Database;
};

function createClient(): postgres.Sql {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    // Vercel may start many short-lived function instances. Each instance
    // therefore keeps only one client connection and lets Supabase's
    // transaction-mode pooler (port 6543) handle concurrency globally.
    max: env.NODE_ENV === 'production' ? 1 : 5,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
    // Routine, expected notices (e.g. "already exists, skipping" on a
    // re-run of an idempotent migration) — never anything actionable.
    onnotice: () => undefined,
  });
}

export function getSql(): postgres.Sql {
  if (!globalForDb.__stembudsClient) {
    globalForDb.__stembudsClient = createClient();
  }
  return globalForDb.__stembudsClient;
}

export function getDb(): Database {
  if (!globalForDb.__stembudsDb) {
    globalForDb.__stembudsDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__stembudsDb;
}

/** Closes the shared client. Used by scripts and by the test harness. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__stembudsClient) {
    await globalForDb.__stembudsClient.end();
    globalForDb.__stembudsClient = undefined;
    globalForDb.__stembudsDb = undefined;
  }
}

export { schema };
