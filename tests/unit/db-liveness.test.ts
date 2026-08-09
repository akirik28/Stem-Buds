import { afterEach, describe, expect, it, vi } from 'vitest';
import type postgres from 'postgres';

const { postgresFactory } = vi.hoisted(() => ({ postgresFactory: vi.fn() }));

vi.mock('postgres', () => ({ default: postgresFactory }));

import { closeDb, ensureDbReady, getSql } from '@/server/db';

type FakeClient = postgres.Sql & { end: ReturnType<typeof vi.fn> };

function fakeClient(probe: () => Promise<unknown>): FakeClient {
  const client = vi.fn(() => probe()) as unknown as FakeClient;
  client.end = vi.fn().mockResolvedValue(undefined);
  return client;
}

describe('database liveness preflight', () => {
  afterEach(async () => {
    await closeDb();
    postgresFactory.mockReset();
  });

  it('reuses a healthy client', async () => {
    const healthy = fakeClient(() => Promise.resolve([{ '?column?': 1 }]));
    postgresFactory.mockReturnValue(healthy);

    await ensureDbReady();

    expect(postgresFactory).toHaveBeenCalledTimes(1);
    expect(getSql()).toBe(healthy);
  });

  it('surfaces the failure when the database does not answer', async () => {
    const unreachable = fakeClient(() => Promise.reject(new Error('CONNECT_TIMEOUT')));
    postgresFactory.mockReturnValue(unreachable);

    await expect(ensureDbReady()).rejects.toThrow('CONNECT_TIMEOUT');
  });

  /**
   * The incident this guards against: closing the shared client also kills any
   * query already in flight on it, which then never settles and hangs the
   * request until the platform's function timeout.
   */
  it('never closes the shared client, on success or on failure', async () => {
    const healthy = fakeClient(() => Promise.resolve([{ '?column?': 1 }]));
    postgresFactory.mockReturnValue(healthy);
    await ensureDbReady();
    expect(healthy.end).not.toHaveBeenCalled();

    await closeDb();
    postgresFactory.mockReset();

    const unreachable = fakeClient(() => Promise.reject(new Error('CONNECT_TIMEOUT')));
    postgresFactory.mockReturnValue(unreachable);
    await expect(ensureDbReady()).rejects.toThrow('CONNECT_TIMEOUT');
    expect(unreachable.end).not.toHaveBeenCalled();
  });

  it('keeps serving the same client across repeated checks', async () => {
    const healthy = fakeClient(() => Promise.resolve([{ '?column?': 1 }]));
    postgresFactory.mockReturnValue(healthy);

    await ensureDbReady();
    await ensureDbReady();

    expect(postgresFactory).toHaveBeenCalledTimes(1);
    expect(getSql()).toBe(healthy);
  });
});
