# STEM & BUDS — Vercel + Supabase Deployment

This is the production path for the no-card pilot deployment.

## Architecture

- GitHub: `akirik28/Stem-Buds`, branch `main`
- Web/API: Vercel Hobby
- PostgreSQL: Supabase Free, Central EU (Frankfurt)
- Persistent media: private Supabase Storage bucket
- Scheduled work: Vercel Cron once daily at `04:00 UTC` (`07:00 Europe/Istanbul`)
- E-mail at first launch: mock only; no message is delivered

Vercel Functions have no persistent local filesystem. Production must therefore
use `STORAGE_BACKEND=supabase`; `UPLOAD_DIR` is only for local development and
tests.

## What the Vercel build does

`vercel.json` runs these steps in order:

1. `npm run db:migrate` — applies all Drizzle migrations idempotently.
2. `npm run storage:setup` — creates the private Storage bucket if absent.
3. `npm run bootstrap:deploy` — creates the two core programs and, only when no
   Executive exists, creates the first Regional Director account.
4. `npm run build` — builds the Next.js production application.

No database password, API key or user password is printed by these commands.

## Required Vercel production variables

| Variable | Value/source |
|---|---|
| `DATABASE_URL` | Supabase Connect → ORM/Drizzle → shared Transaction pooler, port `6543`; replace `[YOUR-PASSWORD]` locally in Vercel |
| `STORAGE_BACKEND` | `supabase` |
| `SUPABASE_URL` | Supabase Settings → API Keys → Project URL |
| `SUPABASE_SECRET_KEY` | Supabase Settings → API Keys → Secret key (`sb_secret_...`); server only |
| `SUPABASE_STORAGE_BUCKET` | `stem-buds-private` |
| `APP_URL` | The final HTTPS Vercel production URL |
| `APP_TIMEZONE` | `Europe/Istanbul` |
| `SESSION_COOKIE_NAME` | `sb_session` |
| `SESSION_COOKIE_SECURE` | `true` |
| `CRON_SECRET` | A new random value of at least 32 characters |
| `EMAIL_TRANSPORT` | `mock` |
| `INITIAL_EXECUTIVE_USERNAME` | First administrator username; 3–64 lowercase characters |
| `INITIAL_EXECUTIVE_NAME` | First administrator's full name |
| `INITIAL_EXECUTIVE_PASSWORD` | A temporary password of 10–128 characters with a letter and number; it must not contain the username |
| `INITIAL_EXECUTIVE_EMAIL` | Optional notification address |

Do not add the Supabase Secret key as a `NEXT_PUBLIC_*` variable. Do not set
`TEST_DATABASE_URL`, SMTP variables or `UPLOAD_DIR` in Vercel.

## First deployment

1. Import `akirik28/Stem-Buds` in Vercel and keep Framework Preset `Next.js`,
   Root Directory `./`, Production Branch `main`.
2. Add the variables above to the Production environment without sharing their
   values in chat, screenshots, source control or build logs.
3. Deploy once. A successful build reports migrations, Storage readiness and
   creation of the first Executive without printing credentials.
4. Open `/api/health`; expect HTTP 200 and `{"status":"ok"}`.
5. Open `/giris`, sign in with the initial username/password and immediately
   choose the permanent password requested by the application.
6. Remove all four `INITIAL_EXECUTIVE_*` variables from Vercel and redeploy.
   Later builds detect the existing Executive and safely skip bootstrap.
7. If Vercel assigned a URL different from the original guess, update `APP_URL`
   to the exact production URL and redeploy.

## Storage and scheduler checks

- In Supabase Storage, `stem-buds-private` must exist and remain private.
- A public-site image upload is capped at 4 MB so both the request and response
  remain below Vercel Function's 4.5 MB payload limit.
- The application server accesses Storage with the Secret key; the browser
  never receives that key.
- Vercel Cron invokes `GET /api/jobs/run` with `CRON_SECRET`. The same route
  retains authenticated `POST` support through `JOB_RUNNER_TOKEN`.
- Hobby permits only one cron run per day. The configured daily run is the
  supported pilot cadence.

## First-launch safety

- Keep `EMAIL_TRANSPORT=mock`; SMTP variables stay unset.
- Leave `GROQ_API_KEY` unset unless management AI is explicitly authorized.
- Never paste `DATABASE_URL`, `SUPABASE_SECRET_KEY`, `CRON_SECRET` or passwords
  into tickets, chat, screenshots or the repository.
