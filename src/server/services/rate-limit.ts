import { createHash } from 'node:crypto';
import { eq, lt, sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { rateLimits } from '@/server/db/schema';

/**
 * Durable fixed-window rate limiting.
 *
 * Backed by the application database so a pilot needs no extra paid service,
 * and so limits survive a restart or a second instance.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

export async function consumeRateLimit(
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const db = getDb();

  const [row] = await db
    .insert(rateLimits)
    .values({ bucketKey, windowStart, counter: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucketKey, rateLimits.windowStart],
      set: { counter: sql`${rateLimits.counter} + 1` },
    })
    .returning({ counter: rateLimits.counter });

  const counter = row?.counter ?? limit + 1;
  return { allowed: counter <= limit, remaining: Math.max(0, limit - counter) };
}

/** Clears the counter for a bucket, e.g. after a successful login. */
export async function resetRateLimit(bucketKey: string): Promise<void> {
  await getDb().delete(rateLimits).where(eq(rateLimits.bucketKey, bucketKey));
}

/** Housekeeping for the scheduled job runner. */
export async function pruneRateLimits(olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const deleted = await getDb()
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, cutoff))
    .returning({ id: rateLimits.id });
  return deleted.length;
}

/**
 * Hashes a client IP before it is stored. The raw address is never persisted,
 * which keeps abuse control possible without keeping unnecessary personal data.
 */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex').slice(0, 64);
}

/** Reads the caller IP from proxy headers, falling back to null. */
export function clientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}

/** Convenience for callers that only need to know whether to reject. */
export async function isRateLimited(
  bucketKey: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const result = await consumeRateLimit(bucketKey, limit, windowMs);
  return !result.allowed;
}
