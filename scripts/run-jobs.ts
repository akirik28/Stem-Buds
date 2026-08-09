import './load-env';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { closeDb } from '../src/server/db';
import { getEnv } from '../src/server/env';
import { runAlertEvaluation } from '../src/server/services/alert-engine';
import { mirrorRecentNotificationsToEmail } from '../src/server/services/notification-service';
import type { EmailProvider } from '../src/server/email/provider';

/**
 * Runs the platform's scheduled work (deterministic alert evaluation, then
 * mirroring recent notifications to e-mail) from a CLI/Cron context rather
 * than `/api/jobs/run`'s bearer-token-authenticated HTTP path — same two
 * service calls, same rules, nothing duplicated or redesigned.
 */

export type RunJobsResult = {
  alertsCreated: number;
  alertsUpdated: number;
  alertsResolved: number;
  alertsFailed: number;
  emailsProcessed: number;
};

export type RunJobsDeps = {
  runAlertEvaluation: typeof runAlertEvaluation;
  mirrorRecentNotificationsToEmail: typeof mirrorRecentNotificationsToEmail;
  closeDb: typeof closeDb;
  /** Test-only override. Production never passes this — the default provider resolves from `EMAIL_TRANSPORT` at send time. */
  emailProvider?: EmailProvider;
};

const defaultDeps: RunJobsDeps = { runAlertEvaluation, mirrorRecentNotificationsToEmail, closeDb };

/**
 * Pure decision, independent of the real process environment, so both
 * branches are directly unit-testable without needing to flip
 * `EMAIL_TRANSPORT` at runtime (which `getEnv()`'s process-lifetime cache
 * would not allow anyway).
 */
export function shouldRefuseSmtp(emailTransport: 'mock' | 'smtp', allowSmtpFlag: boolean): boolean {
  return emailTransport === 'smtp' && !allowSmtpFlag;
}

/** Numbers only — never a recipient, a message body, or any other row content. */
export function formatJobsSummary(result: RunJobsResult): string {
  return (
    `Alerts — created: ${result.alertsCreated}, updated: ${result.alertsUpdated}, ` +
    `resolved: ${result.alertsResolved}, failed: ${result.alertsFailed}. ` +
    `Notifications mirrored to e-mail: ${result.emailsProcessed}.`
  );
}

/**
 * Runs both approved scheduled tasks and always closes the database pool
 * afterward — success or failure — so a Railway Cron invocation never
 * leaves an open handle behind that would keep the process alive.
 */
export async function runJobs(deps: RunJobsDeps = defaultDeps): Promise<RunJobsResult> {
  try {
    const alerts = await deps.runAlertEvaluation({ force: true });
    const email = await deps.mirrorRecentNotificationsToEmail(50, deps.emailProvider);
    return {
      alertsCreated: alerts.created,
      alertsUpdated: alerts.updated,
      alertsResolved: alerts.resolved,
      alertsFailed: alerts.failures,
      emailsProcessed: email.processed,
    };
  } finally {
    await deps.closeDb();
  }
}

async function cli(): Promise<void> {
  const { values } = parseArgs({ options: { 'allow-smtp': { type: 'boolean', default: false } } });
  const env = getEnv();

  if (shouldRefuseSmtp(env.EMAIL_TRANSPORT, values['allow-smtp'] ?? false)) {
    console.error(
      'EMAIL_TRANSPORT=smtp but --allow-smtp was not passed. Refusing to run, so a routine ' +
        '"npm run jobs:run" can never send real e-mail. Pass --allow-smtp only once a real send ' +
        'has been explicitly authorized.',
    );
    process.exit(1);
  }

  console.log('Running scheduled jobs (alert evaluation, notification mirror)...');
  try {
    const result = await runJobs();
    console.log(formatJobsSummary(result));
    process.exit(0);
  } catch (error) {
    console.error('Job run failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(1);
  }
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMainModule) {
  void cli();
}
