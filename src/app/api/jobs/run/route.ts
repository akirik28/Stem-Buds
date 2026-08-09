import { NextResponse } from 'next/server';
import { getEnv } from '@/server/env';
import { safeCompare } from '@/server/auth/password';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { mirrorRecentNotificationsToEmail } from '@/server/services/notification-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
async function runScheduledJobs(request: Request): Promise<NextResponse> {
  const env = getEnv();
  const acceptedTokens = [env.JOB_RUNNER_TOKEN, env.CRON_SECRET].filter(
    (token): token is string => Boolean(token),
  );
  if (acceptedTokens.length === 0) {
    return NextResponse.json({ error: 'Job runner is not configured.' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const authorized = acceptedTokens.some((token) => safeCompare(authHeader, `Bearer ${token}`));
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const alerts = await runAlertEvaluation({ force: true });
  const email = await mirrorRecentNotificationsToEmail();

  return NextResponse.json({ alerts, email });
}

/** Vercel Cron invokes configured paths with GET. */
export async function GET(request: Request): Promise<NextResponse> {
  return runScheduledJobs(request);
}

/** Preserved for external schedulers and manual authenticated operations. */
export async function POST(request: Request): Promise<NextResponse> {
  return runScheduledJobs(request);
}
