import { NextResponse } from 'next/server';
import { getEnv } from '@/server/env';
import { safeCompare } from '@/server/auth/password';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { mirrorRecentNotificationsToEmail } from '@/server/services/notification-service';

/**
 * Automation entry point for an external scheduler (a cron trigger, not a
 * logged-in user) to run periodic work: alert re-evaluation (forced, since
 * the page-load throttle exists to protect against browser traffic, not
 * against an intentional scheduled run) and mirroring recent in-app
 * notifications to e-mail.
 *
 * Authenticated by a bearer token, not a session — there is no user to be
 * logged in as. If `JOB_RUNNER_TOKEN` is unset the endpoint is disabled
 * entirely (fails closed) rather than accepting unauthenticated requests.
 *
 * This route only ever *runs* the already-approved Phase 5 alert engine and
 * the mock-by-default email service — it does not decide what counts as an
 * alert, and it never sends real e-mail unless `EMAIL_TRANSPORT=smtp` is
 * explicitly configured.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const env = getEnv();
  if (!env.JOB_RUNNER_TOKEN) {
    return NextResponse.json({ error: 'Job runner is not configured.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.JOB_RUNNER_TOKEN}`;
  if (!safeCompare(authHeader, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const alerts = await runAlertEvaluation({ force: true });
  const email = await mirrorRecentNotificationsToEmail();

  return NextResponse.json({ alerts, email });
}
