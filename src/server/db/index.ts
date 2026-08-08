import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '@/server/env';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

/**
 * A single pool is shared per process. Next.js re-evaluates modules on every hot
 * reload in development, so the pool is cached on `globalThis` to avoid leaking
 * connections.
 */
const globalForDb = globalThis as unknown as {
  __stembudsPool?: Pool;
  __stembudsDb?: Database;
};

function createPool(): Pool {
  const env = getEnv();
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: env.NODE_ENV === 'production' ? 10 : 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  if (!globalForDb.__stembudsPool) {
    globalForDb.__stembudsPool = createPool();
  }
  return globalForDb.__stembudsPool;
}

export function getDb(): Database {
  if (!globalForDb.__stembudsDb) {
    globalForDb.__stembudsDb = drizzle(getPool(), { schema });
  }
  return globalForDb.__stembudsDb;
}

/** Closes the shared pool. Used by scripts and by the test harness. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__stembudsPool) {
    await globalForDb.__stembudsPool.end();
    globalForDb.__stembudsPool = undefined;
    globalForDb.__stembudsDb = undefined;
  }
}

export { schema };
