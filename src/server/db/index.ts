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
  __stembudsReadyCheck?: Promise<void>;
  __stembudsLastHealthyAt?: number;
};

const LIVENESS_CACHE_MS = 5_000;
const LIVENESS_TIMEOUT_MS = 3_000;

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

async function withinTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Database liveness check timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function terminateClient(client: postgres.Sql): Promise<void> {
  try {
    // A zero-second timeout force-closes a socket that may already be stale.
    await client.end({ timeout: 0 });
  } catch {
    // The client is being discarded either way. Never mask the replacement
    // attempt with an error raised while closing an already-broken socket.
  }
}

function detachClient(client: postgres.Sql): void {
  if (globalForDb.__stembudsClient !== client) return;
  globalForDb.__stembudsClient = undefined;
  globalForDb.__stembudsDb = undefined;
  globalForDb.__stembudsLastHealthyAt = undefined;
}

async function probe(client: postgres.Sql): Promise<void> {
  await withinTimeout(client`SELECT 1`, LIVENESS_TIMEOUT_MS);
}

/**
 * Verifies that a cached Postgres.js socket survived a serverless pause.
 *
 * Vercel can freeze a warm function between requests while Supavisor or an
 * intermediate NAT expires the idle TCP socket. Postgres.js then appears to
 * hang when that socket is reused. A short preflight lets us discard the
 * stale client and retry once with a fresh connection before real work starts.
 */
export async function ensureDbReady(options: { force?: boolean } = {}): Promise<void> {
  const now = Date.now();
  if (
    !options.force &&
    globalForDb.__stembudsClient &&
    globalForDb.__stembudsLastHealthyAt &&
    now - globalForDb.__stembudsLastHealthyAt < LIVENESS_CACHE_MS
  ) {
    return;
  }

  if (globalForDb.__stembudsReadyCheck) {
    return globalForDb.__stembudsReadyCheck;
  }

  const readyCheck = (async () => {
    const current = getSql();
    try {
      await probe(current);
      globalForDb.__stembudsLastHealthyAt = Date.now();
      return;
    } catch {
      detachClient(current);
      await terminateClient(current);
    }

    const replacement = getSql();
    try {
      await probe(replacement);
      globalForDb.__stembudsLastHealthyAt = Date.now();
    } catch (error) {
      detachClient(replacement);
      await terminateClient(replacement);
      throw error;
    }
  })();

  globalForDb.__stembudsReadyCheck = readyCheck;
  try {
    await readyCheck;
  } finally {
    if (globalForDb.__stembudsReadyCheck === readyCheck) {
      globalForDb.__stembudsReadyCheck = undefined;
    }
  }
}

/** Closes the shared client. Used by scripts and by the test harness. */
export async function closeDb(): Promise<void> {
  if (globalForDb.__stembudsClient) {
    await globalForDb.__stembudsClient.end();
    globalForDb.__stembudsClient = undefined;
    globalForDb.__stembudsDb = undefined;
  }
  globalForDb.__stembudsLastHealthyAt = undefined;
  globalForDb.__stembudsReadyCheck = undefined;
}

export { schema };
