import { describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/jobs/run/route';

/**
 * `getEnv()` caches its parsed result for the lifetime of the process, so
 * this file deliberately does not try to flip `JOB_RUNNER_TOKEN` at runtime
 * (whatever the test environment resolved it to at first read is what every
 * call here sees). What's robustly testable regardless of that value: a
 * request bearing an obviously-wrong token can never succeed — it is either
 * rejected as unauthorized or the endpoint reports itself disabled, but
 * never a 200.
 */
describe('POST /api/jobs/run', () => {
  it('never runs the job for a request with the wrong bearer token', async () => {
    const request = new Request('http://localhost/api/jobs/run', {
      method: 'POST',
      headers: { authorization: 'Bearer definitely-not-the-real-token' },
    });
    const response = await POST(request);
    expect(response.status).not.toBe(200);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });

  it('never runs the job for a request with no Authorization header at all', async () => {
    const request = new Request('http://localhost/api/jobs/run', { method: 'POST' });
    const response = await POST(request);
    expect(response.status).not.toBe(200);
  });

  it('protects the GET endpoint used by Vercel Cron with the same bearer authentication', async () => {
    const request = new Request('http://localhost/api/jobs/run', {
      method: 'GET',
      headers: { authorization: 'Bearer definitely-not-the-real-token' },
    });
    const response = await GET(request);
    expect(response.status).not.toBe(200);
  });
});
