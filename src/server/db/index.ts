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
  __stembudsLastHealthyAt?: number;
};

function createClient(): postgres.Sql {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    // One instance serves many requests concurrently, so a single connection
    // would make every query queue behind the slowest one — deep enough under
    // load to blow the platform's function timeout. Supabase's transaction
    // pooler admits far more clients than the instances we run, so a small
    // per-instance pool stays well inside its budget.
    max: 5,
    // Supabase's pooler (and Vercel's own network layer) can silently drop an
    // idle socket before postgres-js notices. Closing proactively — sooner
    // than any remote-side timeout — means the next request opens a fresh
    // connection instead of reusing one that's already dead.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
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

/**
 * Confirms the database answers before a request does real work.
 *
 * This must never tear the client down. The shared client carries a single
 * connection in production, so force-closing it also kills whatever query is
 * already in flight on it — that query then never settles and the request
 * hangs until the platform's function timeout. Postgres.js reconnects on its
 * own when it finds a closed socket, so a plain probe is enough.
 */
export async function ensureDbReady(): Promise<void> {
  const client = getSql();
  await client`SELECT 1`;
  globalForDb.__stembudsLastHealthyAt = Date.now();
}

/** Closes the shared client. Used by scripts and by the test harness. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__stembudsClient) {
    await globalForDb.__stembudsClient.end();
    globalForDb.__stembudsClient = undefined;
    globalForDb.__stembudsDb = undefined;
  }
  globalForDb.__stembudsLastHealthyAt = undefined;
}

export { schema };
