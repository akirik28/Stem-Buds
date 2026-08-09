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

    await ensureDbReady({ force: true });

    expect(postgresFactory).toHaveBeenCalledTimes(1);
    expect(getSql()).toBe(healthy);
    expect(healthy.end).not.toHaveBeenCalled();
  });

  it('discards a stale client and succeeds with one fresh retry', async () => {
    const stale = fakeClient(() => Promise.reject(new Error('CONNECT_TIMEOUT')));
    const replacement = fakeClient(() => Promise.resolve([{ '?column?': 1 }]));
    postgresFactory.mockReturnValueOnce(stale).mockReturnValueOnce(replacement);

    await ensureDbReady({ force: true });

    expect(postgresFactory).toHaveBeenCalledTimes(2);
    expect(stale.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(getSql()).toBe(replacement);
  });

  it('fails promptly when both the cached and replacement clients are unavailable', async () => {
    const stale = fakeClient(() => Promise.reject(new Error('CONNECT_TIMEOUT')));
    const replacement = fakeClient(() => Promise.reject(new Error('CONNECT_TIMEOUT')));
    postgresFactory.mockReturnValueOnce(stale).mockReturnValueOnce(replacement);

    await expect(ensureDbReady({ force: true })).rejects.toThrow('CONNECT_TIMEOUT');

    expect(stale.end).toHaveBeenCalledWith({ timeout: 0 });
    expect(replacement.end).toHaveBeenCalledWith({ timeout: 0 });
  });
});
