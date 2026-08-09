# Railway Deployment Runbook — STEM & BUDS

This is a manual runbook, not automation. It matches the repository as of
commit `ef8bfe7` (branch `main`, `github.com/akirik28/Stem-Buds`). No secret
values appear anywhere in this document — every variable below is named,
not filled in.

This document describes how to deploy. It does not deploy anything by
itself, and no step here should be run without the person doing the
deployment deliberately choosing to run it.

## 1. Architecture

- **Source**: GitHub repository `akirik28/Stem-Buds`, production branch `main`.
- **Web service**: one persistent Railway service running the Next.js app
  (`npm run build` / `npm run start`). Not serverless/edge — the app uses a
  long-lived `pg` connection pool and local filesystem storage, both of
  which need a persistent process.
- **Database**: Railway's managed PostgreSQL plugin.
- **File storage**: a Railway Volume mounted at `/app/storage`, referenced
  by `UPLOAD_DIR=/app/storage`. Public site media (Phase 11) and message
  attachments (schema exists; no upload UI is wired up yet as of this
  commit) both resolve through `UPLOAD_DIR`.
- **Scheduled jobs**: a **separate** Railway service in the same project,
  built from the same repository, running `npm run jobs:run` on a Cron
  trigger instead of serving HTTP traffic. It must not receive a public
  domain and must exit (not stay resident) after each run — see §13.
- **Domain**: deploy first to Railway's generated `*.up.railway.app`
  temporary domain. Attach a custom domain only after smoke testing (§17).
- **Backups**: enable Railway's managed Postgres backups and back up the
  storage Volume (§16). Neither is automatic by default.

### Why one web-service replica

`UPLOAD_DIR` is a local filesystem path on a Railway Volume. A Volume
attaches to exactly one running instance. Running more than one web
replica would mean different instances see different files — the second
replica wouldn't find a file the first one wrote. Stay at **one replica**
for this deployment. Moving to multiple replicas or serverless would first
require moving uploads to real object storage, which is out of scope here
and not something the current approved application needs yet.

### Why a second, separate service for Cron

Railway does not run a mixed web+cron process cleanly: a cron-triggered
run of a web service either fights the persistent server for the port or
requires workarounds. A dedicated service — same repo, same environment
variables, different start command, no exposed port — is the clean fit,
and it's what `npm run jobs:run` (this task) was built for.

## 2. Web service settings

| Setting | Value |
|---|---|
| Build Command | `npm run build` |
| Pre-deploy Command | `npm run db:migrate` |
| Start Command | `npm run start` |
| Healthcheck Path | `/api/health` |
| Node version | >= 20.9.0 (matches `package.json`'s `engines.node`; pick Railway's Node 20 or 22 image) |
| Replicas | 1 (see above) |
| Port | Do not hardcode one. `next start` already binds to Railway's `PORT` automatically — no code or config change needed. |
| Volume | Mount at `/app/storage` |

Pre-deploy running `npm run db:migrate` means every deploy applies pending
Drizzle migrations before the new code starts serving traffic. This is the
same `scripts/migrate.ts` used locally — nothing deploy-specific about it.

## 3. Environment variables — web service

Set these by **name** in Railway's variable editor. Nothing here is a real
value — fill in your own where indicated.

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `DATABASE_URL` | Railway variable reference to the Postgres service (e.g. `${{Postgres.DATABASE_URL}}`) | Never paste a literal connection string — reference the plugin so it updates automatically if Railway rotates it. |
| `APP_URL` | the app's own public URL | Set to the temporary `*.up.railway.app` URL first (§10), update after attaching a custom domain (§17). |
| `APP_TIMEZONE` | `Europe/Istanbul` | |
| `SESSION_COOKIE_NAME` | `sb_session` | |
| `SESSION_COOKIE_SECURE` | `true` | Railway serves over HTTPS; this must be `true` in production so the session cookie carries the `Secure` flag. |
| `BOOTSTRAP_TOKEN` | a long random value you generate | Required in production — `scripts/bootstrap-executive.ts` refuses to run without it when `NODE_ENV=production`. Generate it yourself (e.g. `openssl rand -hex 32`); do not reuse any token from this repository or your local `.env.local`. |
| `JOB_RUNNER_TOKEN` | a long random value you generate | Authenticates `POST /api/jobs/run`. Same generation guidance as above. Only needed on the web service if you intend to also trigger jobs over HTTP; the Cron service (§13) calls the code directly and does not need this. |
| `EMAIL_TRANSPORT` | `mock` | **Required for the first deployment.** No real e-mail is sent in mock mode — see §9. |
| `EMAIL_FROM_NAME` | `STEM & BUDS` | Only meaningful once `EMAIL_TRANSPORT=smtp` is separately authorized; harmless to set now. |
| `EMAIL_FROM_ADDRESS` | `stemandbuds01@gmail.com` | Same. |
| `UPLOAD_DIR` | `/app/storage` | Must match the Volume mount path exactly. |
| `GROQ_API_KEY` | your Groq key, if the Phase 5 AI surfaces should be enabled | **Optional.** Server-only — never referenced from a client component, never logged (see `src/server/env.ts`'s own doc comment). Leave unset to run with AI surfaces gracefully disabled; every other feature is unaffected. |

`TEST_DATABASE_URL` is **not** a production variable. It exists only for
the local/CI automated test suite and must never point at the production
database. Do not set it on the web or Cron service.

### Variables that must NOT be set yet

These belong to real SMTP delivery. Do not add any of them to Railway
during this deployment — real-email activation is a separate, explicitly
authorized action, not part of standing the app up:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `EMAIL_TRANSPORT=smtp`

### General secret hygiene

- Never create a `NEXT_PUBLIC_*` version of any secret above. None of them
  are meant to reach the browser; `src/server/env.ts` is deliberately only
  ever imported from server-side code.
- Do not put any secret value in GitHub (commits, PRs, issues, Actions
  logs), in this document, or in application logs.
- Do not copy `.env.local` into Railway. Set each variable by hand (or via
  Railway's CLI) from a value you generate or obtain for production
  specifically.

## 4. Environment variables — Cron service

Same project, same variable set as the web service, with two differences:

- **Start Command** is `npm run jobs:run` instead of `npm run start` (see
  §13 for the full service configuration).
- `JOB_RUNNER_TOKEN` is not needed here — the Cron service calls
  `runJobs()` (in `scripts/run-jobs.ts`) directly, in-process. That token
  only guards the HTTP path (`POST /api/jobs/run`), which this service
  never uses.

`EMAIL_TRANSPORT=mock` applies here too. See §9 and §15 — the Cron service
must not run with `EMAIL_TRANSPORT=smtp` until that is separately
authorized, and even then `npm run jobs:run` refuses to send unless
invoked with `--allow-smtp` explicitly.

## 5. `/api/health`

`GET /api/health` (added in this commit) is what Railway's Healthcheck
Path setting should point at:

- Requires no authentication (Railway must be able to reach it).
- Runs a minimal `SELECT 1` against the database.
- Returns `200 {"status":"ok"}` when reachable, `503 {"status":"unavailable"}`
  otherwise — never an error message, stack trace, host name, database
  name, or any other detail.
- Sends `Cache-Control: no-store`, so Railway (or any proxy) never caches
  a stale result.
- Never runs a migration and never writes an audit record — it is a pure
  read-only probe, safe to call as often as Railway likes.

## 6. First Executive bootstrap

Run **exactly once**, after the first successful deploy, from a machine
with the production `DATABASE_URL` and `BOOTSTRAP_TOKEN` available (e.g.
`railway run` against the web service, or any environment with those two
variables set to the production values):

```bash
npm run bootstrap:executive -- --username <username> --name "<Full Name>" --role regional_director --token <BOOTSTRAP_TOKEN>
```

`--role` must be one of the repository's exact valid Executive role names:
`regional_director` or `vice_president` (see `EXECUTIVE_ROLES` in
`scripts/bootstrap-executive.ts`). The script refuses to run a second time
once any Executive account exists — further accounts are created from the
admin UI (`/panel/kullanicilar`), not this script.

The command prints a one-time temporary password to the terminal. It is
never stored anywhere by the application. Log in with it immediately and
set a real password at first login (the app forces this — every account's
`mustChangePassword` flag routes to `/sifre-belirle` before anything else
is reachable).

## 7. Deployment sequence

Follow in order. Each step assumes the previous one succeeded.

1. **Create an empty Railway project.**
2. **Add PostgreSQL** from Railway's plugin catalog.
3. **Add the web service**, pointing at the `akirik28/Stem-Buds` GitHub
   repository, branch `main`.
4. **Reference `DATABASE_URL`** on the web service from the Postgres
   plugin (a Railway variable reference, not a pasted string — §3).
5. **Add the remaining required variables** from §3 (skip the SMTP block).
6. **Add the Volume**, mounted at `/app/storage`, to the web service.
7. **Configure** Build Command, Pre-deploy Command, Start Command, and
   Healthcheck Path exactly as in §2.
8. **Deploy.** The first deploy is reachable only at Railway's generated
   temporary `*.up.railway.app` domain.
9. **Set `APP_URL`** to that temporary domain and redeploy, so the app's
   own absolute-URL generation (e.g. links) is correct.
10. **Run the first Executive bootstrap** (§6) — exactly once.
11. **Log in and change the temporary password** immediately, as forced by
    the app.
12. **Smoke test in production** (§8) using safe, clearly-labelled,
    disposable data — never real student/mentor/chapter data during this
    first pass.
13. **Create the separate Cron service** (§13), same repository, same
    project, its own Start Command.
14. **Confirm the Cron service has no public domain** and terminates after
    each run rather than staying resident (§13).
15. **Leave Cron in `EMAIL_TRANSPORT=mock`** for now (§4, §15).
16. **Enable backups** for Postgres and the storage Volume (§16).
17. **Attach the custom domain** only after smoke tests in §12 pass, then
    update `APP_URL` again and redeploy.
18. Keep **rollback and recovery** steps (§18) at hand before inviting any
    real user.
19. **Real SMTP activation is a separate, later, explicitly authorized
    step** (§19) — not part of this deployment.

## 8. Production smoke testing (step 12)

With safe/disposable data only:

- Load the public homepage (`/`) and confirm it renders.
- Load `/haberler` and confirm the empty/populated state renders correctly.
- Load `/giris` and confirm the login form renders.
- Log in as the bootstrapped Executive; confirm `/panel` loads.
- Confirm a non-Executive route redirect (e.g. try `/panel/denetim-kaydi`
  before creating any other account — it should already be Executive-only
  by role, so this mainly confirms the page itself renders for you).
- Confirm `/api/health` returns `200 {"status":"ok"}`.
- Create one throwaway QA chapter/group/account, confirm it behaves, then
  deactivate/remove it the same way local QA sessions already do (see the
  project's own established QA-hygiene pattern: additive-only test data,
  `deactivateUser` rather than hard delete once a QA account has logged
  in, clean up afterward).
- Confirm no email was sent (mock mode — check the app's email log via
  the database if in doubt; there is no SMTP connection to check because
  none should have been attempted).

## 9. Why `EMAIL_TRANSPORT=mock` for the first deployment

`EMAIL_TRANSPORT=mock` (the zod-schema default, and what §3 sets
explicitly) means `MockEmailProvider` handles every send: nothing is
delivered, nothing opens a network connection, every attempt is logged to
the app's own `email_logs` table as `skipped`. This lets you smoke-test
account creation, notifications, and every other email-touching feature
in production without any risk of a real message reaching anyone. Real
SMTP is a deliberate, separate, later decision — see §19.

## 10. `TEST_DATABASE_URL` and `.env.local`

Neither belongs in Railway:

- `TEST_DATABASE_URL` only exists for the local/CI automated test suite
  (`tests/setup.ts` requires it to be set, and every integration test
  truncates that database between runs). It must never point at
  production, and the production service does not need it at all.
- `.env.local` is a local development file, gitignored, and must never be
  copied into Railway's variable editor. Every variable Railway needs is
  listed by name in §3/§4 above — set each one directly, from a value you
  generate or obtain for production.

## 11. Job runner (Cron service) configuration

| Setting | Value |
|---|---|
| Source | same `akirik28/Stem-Buds` repository, `main` branch |
| Build Command | `npm run build` (same build as the web service — the script is compiled the same way) |
| Start Command | `npm run jobs:run` |
| Healthcheck Path | none — this service serves no HTTP traffic; do not set a healthcheck path meant for a web process here |
| Public domain | **none.** Do not expose this service publicly. |
| Trigger | Railway Cron, on a schedule — **not yet decided; see §12.** |
| Replicas | 1, and only while the Cron trigger runs it — it should not stay resident between runs |

`scripts/run-jobs.ts` (added in this commit) is what actually runs:
`runAlertEvaluation({ force: true })` then `mirrorRecentNotificationsToEmail()`
— the same two calls `POST /api/jobs/run` makes, reusing the same services
and the same deterministic-alert rules (nothing about the alert engine or
AI insight generation was duplicated or changed to build this). It closes
the database pool in a `finally` block and calls `process.exit(0)` on
success / `process.exit(1)` on failure, so a Railway Cron run genuinely
terminates instead of leaving a process (and an open Postgres connection)
behind.

**Safety barrier**: if `EMAIL_TRANSPORT=smtp` is ever set on this service,
`npm run jobs:run` refuses to run at all unless invoked with
`--allow-smtp` explicitly — the plain `npm run jobs:run` Railway would
otherwise use is incapable of accidentally sending real e-mail. See §19.

## 12. Cron schedule — not yet decided

**No authoritative cadence exists yet for this job.** Do not guess one.
Whoever configures the Cron trigger in Railway must confirm the intended
schedule (e.g. hourly, every 15 minutes — matching how promptly alerts and
mirrored notifications are expected to appear) with the product owner
before setting it, and record the chosen schedule here once decided:

> **Cron schedule: TBD — confirm during Railway setup, then update this line.**

## 13. Backups (step 16)

- **Postgres**: enable Railway's managed backup feature for the Postgres
  plugin. Confirm the retention window meets the organization's actual
  needs before relying on it.
- **Storage Volume**: Railway Volumes are not automatically backed up the
  same way the managed Postgres plugin is. Establish a periodic export of
  `/app/storage` (e.g. a scheduled copy to external storage) before this
  deployment holds any real uploaded media that would be painful to lose.
  This deployment does not yet have that export configured — treat it as
  an open item to close before real users start uploading real content.

## 14. Rollback and recovery

- **Bad deploy**: Railway keeps prior deployments — redeploy the last
  known-good one from the service's deployment history. Because
  `db:migrate` runs as a pre-deploy step, confirm any migration introduced
  by the bad deploy is safe to leave applied (Drizzle migrations in this
  repository are additive; check the specific migration before assuming
  it's safe to roll the *code* back while leaving the *schema* forward).
- **Bad migration**: fix forward with a new migration rather than trying
  to hand-edit or delete an already-applied one. `scripts/migrate.ts`
  applies pending migrations in order; nothing in this repository
  currently supports an automatic "down" migration.
- **Database restore**: restore from the Postgres plugin's backup (§13)
  into a new instance, verify it, then repoint `DATABASE_URL` — never
  restore over the live production database as a first attempt.
- **Storage loss**: restore `/app/storage` from whatever periodic export
  was configured per §13. Rows in `public_media`/message-attachment tables
  whose files are missing degrade to a broken image/link rather than a
  crash (the serving routes already 404 cleanly on a missing file — see
  `src/app/api/public-media/[id]/route.ts`), so a partial storage loss is
  recoverable without a full outage.

## 15. Real SMTP activation — separate, later, explicitly authorized

Do **not** do this as part of standing up the deployment. When (and only
when) it is separately authorized:

1. Set `EMAIL_TRANSPORT=smtp` and the five `SMTP_*` variables (§3) on the
   web service (and the Cron service, if it should also send real mail).
2. Redeploy.
3. The Cron service's ordinary `npm run jobs:run` will now refuse to run
   (the safety barrier in §11) until it is invoked as
   `npm run jobs:run -- --allow-smtp` — update the Cron service's Start
   Command deliberately at that point, as its own explicit step, not as a
   side effect of flipping the environment variable.
4. Smoke test a single real send to an address you control before trusting
   it for real users.

Until that authorization happens, this deployment sends no real e-mail
under any normal operation, including its own scheduled Cron runs.

## Explicitly out of scope for this deployment

- Redis, a job queue, Docker, Kubernetes, or object storage — none of them
  are required by the application as it exists in this commit, so none
  were added.
- Multiple web-service replicas — blocked by local-filesystem uploads
  (§1); revisit only alongside a real object-storage migration.
- A repository-level `railway.json`. The web service and the Cron service
  need different Start Commands and different Healthcheck settings; a
  single shared `railway.json` would either omit the Cron service's needs
  or wrongly impose the web service's health check and start command on
  it. Two services configured by hand in the Railway dashboard (per §2 and
  §11) is the correct, unambiguous setup — add `railway.json` later only
  if Railway's per-service config (not a shared root file) supports both
  services without that risk.
