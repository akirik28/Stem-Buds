import { describe, expect, it, vi } from 'vitest';
import { formatJobsSummary, runJobs, shouldRefuseSmtp, type RunJobsDeps } from '../../scripts/run-jobs';

const alertsSummary = { throttled: false, evaluatedGroups: 3, created: 1, updated: 2, resolved: 0, failures: 0 };
const emailSummary = { processed: 5 };

function fakeDeps(overrides: Partial<RunJobsDeps> = {}): RunJobsDeps {
  return {
    runAlertEvaluation: vi.fn().mockResolvedValue(alertsSummary),
    mirrorRecentNotificationsToEmail: vi.fn().mockResolvedValue(emailSummary),
    closeDb: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('shouldRefuseSmtp', () => {
  it('refuses smtp transport unless the flag is explicitly passed', () => {
    expect(shouldRefuseSmtp('smtp', false)).toBe(true);
    expect(shouldRefuseSmtp('smtp', true)).toBe(false);
  });

  it('never refuses mock transport, flag or not', () => {
    expect(shouldRefuseSmtp('mock', false)).toBe(false);
    expect(shouldRefuseSmtp('mock', true)).toBe(false);
  });
});

describe('formatJobsSummary', () => {
  it('contains only the numeric totals — never recipient, message, or credential content', () => {
    const text = formatJobsSummary({ alertsCreated: 1, alertsUpdated: 2, alertsResolved: 3, alertsFailed: 0, emailsProcessed: 5 });
    expect(text).toContain('1');
    expect(text).toContain('5');
    // No email-shaped, token-shaped, or secret-labelled content ever appears in a log line.
    expect(text).not.toMatch(/[^\s]+@[^\s]+\.[^\s]+/);
    expect(text.toLowerCase()).not.toMatch(/password|token|secret|smtp|connectionstring/);
  });
});

describe('runJobs', () => {
  it('invokes both approved scheduled tasks exactly once, with the deterministic force flag', async () => {
    const deps = fakeDeps();
    await runJobs(deps);
    expect(deps.runAlertEvaluation).toHaveBeenCalledTimes(1);
    expect(deps.runAlertEvaluation).toHaveBeenCalledWith({ force: true });
    expect(deps.mirrorRecentNotificationsToEmail).toHaveBeenCalledTimes(1);
  });

  it('passes an injected e-mail provider straight through, never substituting its own', async () => {
    const provider = { name: 'test-mock', send: vi.fn() };
    const deps = fakeDeps({ emailProvider: provider });
    await runJobs(deps);
    expect(deps.mirrorRecentNotificationsToEmail).toHaveBeenCalledWith(50, provider);
  });

  it('resolves with the merged totals from both tasks on success', async () => {
    const result = await runJobs(fakeDeps());
    expect(result).toEqual({
      alertsCreated: 1,
      alertsUpdated: 2,
      alertsResolved: 0,
      alertsFailed: 0,
      emailsProcessed: 5,
    });
  });

  it('always closes the database connection, even on success', async () => {
    const deps = fakeDeps();
    await runJobs(deps);
    expect(deps.closeDb).toHaveBeenCalledTimes(1);
  });

  it('propagates a failure from alert evaluation, but still closes the database connection', async () => {
    const failure = new Error('alert evaluation exploded');
    const deps = fakeDeps({ runAlertEvaluation: vi.fn().mockRejectedValue(failure) });
    await expect(runJobs(deps)).rejects.toThrow('alert evaluation exploded');
    expect(deps.closeDb).toHaveBeenCalledTimes(1);
    expect(deps.mirrorRecentNotificationsToEmail).not.toHaveBeenCalled();
  });

  it('propagates a failure from the notification mirror, but still closes the database connection', async () => {
    const failure = new Error('mirror exploded');
    const deps = fakeDeps({ mirrorRecentNotificationsToEmail: vi.fn().mockRejectedValue(failure) });
    await expect(runJobs(deps)).rejects.toThrow('mirror exploded');
    expect(deps.closeDb).toHaveBeenCalledTimes(1);
  });

  it('closes the database connection even if closeDb itself is the only thing that would otherwise leave a handle open', async () => {
    const deps = fakeDeps();
    await runJobs(deps);
    // A second run must not error just because the pool was already closed by the first —
    // the mock here stands in for that being the real function's contract, not re-testing pg itself.
    await runJobs(deps);
    expect(deps.closeDb).toHaveBeenCalledTimes(2);
  });
});
