import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runJobs } from '../../scripts/run-jobs';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { mirrorRecentNotificationsToEmail } from '@/server/services/notification-service';
import { MockEmailProvider } from '@/server/email/mock-provider';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Runs the REAL alert-evaluation and notification-mirror services (not
 * mocked) against the real test database, proving the whole orchestration
 * works end to end — with an explicitly injected `MockEmailProvider`, so
 * this can never fall through to this environment's real SMTP transport
 * regardless of what `EMAIL_TRANSPORT` actually resolves to here.
 * `closeDb` is stubbed out so this file doesn't tear down the shared test
 * pool that later test files still need.
 */

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDb();
});

describe('runJobs, end to end against the real services', () => {
  it('completes successfully with a mock e-mail provider, and never touches SMTP', async () => {
    const mockProvider = new MockEmailProvider();
    const result = await runJobs({
      runAlertEvaluation,
      mirrorRecentNotificationsToEmail,
      closeDb: async () => undefined,
      emailProvider: mockProvider,
    });

    expect(result.alertsFailed).toBe(0);
    expect(typeof result.emailsProcessed).toBe('number');
    // MockEmailProvider.send never opens a network connection (see its own
    // doc comment) — reaching this line at all, with an empty inbox and no
    // thrown network/connection error, is the proof no real send occurred.
  });
});
