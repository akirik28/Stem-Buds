import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { getPool } from '@/server/db';

/**
 * The route talks to the real test database (same convention as every other
 * integration test in this suite) for the success path, and spies on the
 * pool's `query` for exactly one call to simulate the database being down —
 * no real infrastructure is ever touched or taken offline.
 */
describe('GET /api/health', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('genuinely exists as a route file, and exports a real GET handler', () => {
    const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'health', 'route.ts');
    expect(existsSync(routePath)).toBe(true);
    expect(typeof GET).toBe('function');
  });

  it('returns 200 and {status:"ok"} when the database is reachable', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('sets Cache-Control: no-store on a healthy response', async () => {
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('returns 503 and {status:"unavailable"} when the database cannot be reached', async () => {
    vi.spyOn(getPool(), 'query').mockRejectedValueOnce(
      new Error('connection refused to db-internal.railway.internal:5432 user=postgres password=hunter2'),
    );
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  });

  it('never leaks the underlying error message, host, or credentials on failure', async () => {
    vi.spyOn(getPool(), 'query').mockRejectedValueOnce(
      new Error('connection refused to db-internal.railway.internal:5432 user=postgres password=hunter2'),
    );
    const response = await GET();
    const raw = await response.text();
    expect(raw).not.toContain('railway');
    expect(raw).not.toContain('postgres');
    expect(raw).not.toContain('hunter2');
    expect(raw).not.toContain('refused');
    expect(raw).not.toContain('5432');
  });

  it('still sets Cache-Control: no-store on a failure response', async () => {
    vi.spyOn(getPool(), 'query').mockRejectedValueOnce(new Error('down'));
    const response = await GET();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('recovers on the next call once the database answers again (the mocked failure is one-shot)', async () => {
    vi.spyOn(getPool(), 'query').mockRejectedValueOnce(new Error('down'));
    await GET();
    const recovered = await GET();
    expect(recovered.status).toBe(200);
  });
});
