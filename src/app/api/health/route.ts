import { NextResponse } from 'next/server';
import { ensureDbReady } from '@/server/db';

/**
 * Railway health-check target. Deliberately outside the app's auth model —
 * Railway itself must be able to reach it — and deliberately minimal: a
 * trivial connectivity probe, never a data query, never a migration, never
 * an audit write. Any failure collapses to the same generic `unavailable`
 * body regardless of cause, so nothing about the database (host, name,
 * version) or the failure (message, stack) ever reaches the response.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const headers = { 'Cache-Control': 'no-store' };

  try {
    await ensureDbReady();
    return NextResponse.json({ status: 'ok' }, { status: 200, headers });
  } catch {
    return NextResponse.json({ status: 'unavailable' }, { status: 503, headers });
  }
}
