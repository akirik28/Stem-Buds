import { z } from 'zod';

/**
 * Server-only environment access.
 *
 * Never import this module from a client component: it deliberately exposes
 * secrets such as the SMTP password to the server runtime only.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase()),
  );

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    TEST_DATABASE_URL: z.string().optional(),

    APP_URL: z.string().url().default('http://localhost:3000'),
    APP_TIMEZONE: z.string().min(1).default('Europe/Istanbul'),
    SESSION_COOKIE_NAME: z.string().min(1).default('sb_session'),
    SESSION_COOKIE_SECURE: booleanish.default(false),

    BOOTSTRAP_TOKEN: z.string().optional(),
    JOB_RUNNER_TOKEN: z.string().optional(),
    CRON_SECRET: z.string().optional(),

    EMAIL_TRANSPORT: z.enum(['mock', 'smtp']).default('mock'),
    EMAIL_FROM_NAME: z.string().default('STEM & BUDS'),
    EMAIL_FROM_ADDRESS: z.string().default('stemandbuds01@gmail.com'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_SECURE: booleanish.default(true),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),

    STORAGE_BACKEND: z.enum(['filesystem', 'supabase']).default('filesystem'),
    UPLOAD_DIR: z.string().default('./storage'),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    SUPABASE_STORAGE_BUCKET: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/, 'Invalid Supabase Storage bucket name')
      .default('stem-buds-private'),

    // Used only by the idempotent first-deploy bootstrap script. Remove these
    // values from the hosting environment after the first Executive exists.
    INITIAL_EXECUTIVE_USERNAME: z.string().optional(),
    INITIAL_EXECUTIVE_NAME: z.string().optional(),
    INITIAL_EXECUTIVE_PASSWORD: z.string().optional(),
    INITIAL_EXECUTIVE_EMAIL: z.string().email().optional(),

    /**
     * Server-only. Never read from a client component, never logged, never
     * included in a client bundle. Optional: Phase 5 AI surfaces degrade to
     * the graceful "unavailable" state (see `server/ai/provider.ts`) when unset.
     */
    GROQ_API_KEY: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.STORAGE_BACKEND !== 'supabase') return;
    if (!value.SUPABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_URL'],
        message: 'SUPABASE_URL is required when STORAGE_BACKEND=supabase',
      });
    }
    if (!value.SUPABASE_SECRET_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['SUPABASE_SECRET_KEY'],
        message: 'SUPABASE_SECRET_KEY is required when STORAGE_BACKEND=supabase',
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema>;

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

let cached: ServerEnv | null = null;

export function getEnv(): ServerEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL:
      process.env.NODE_ENV === 'test'
        ? (emptyToUndefined(process.env.TEST_DATABASE_URL) ?? process.env.DATABASE_URL)
        : process.env.DATABASE_URL,
    TEST_DATABASE_URL: emptyToUndefined(process.env.TEST_DATABASE_URL),
    APP_URL: emptyToUndefined(process.env.APP_URL),
    APP_TIMEZONE: emptyToUndefined(process.env.APP_TIMEZONE),
    SESSION_COOKIE_NAME: emptyToUndefined(process.env.SESSION_COOKIE_NAME),
    SESSION_COOKIE_SECURE: emptyToUndefined(process.env.SESSION_COOKIE_SECURE),
    BOOTSTRAP_TOKEN: emptyToUndefined(process.env.BOOTSTRAP_TOKEN),
    JOB_RUNNER_TOKEN: emptyToUndefined(process.env.JOB_RUNNER_TOKEN),
    CRON_SECRET: emptyToUndefined(process.env.CRON_SECRET),
    EMAIL_TRANSPORT: emptyToUndefined(process.env.EMAIL_TRANSPORT),
    EMAIL_FROM_NAME: emptyToUndefined(process.env.EMAIL_FROM_NAME),
    EMAIL_FROM_ADDRESS: emptyToUndefined(process.env.EMAIL_FROM_ADDRESS),
    SMTP_HOST: emptyToUndefined(process.env.SMTP_HOST),
    SMTP_PORT: emptyToUndefined(process.env.SMTP_PORT),
    SMTP_SECURE: emptyToUndefined(process.env.SMTP_SECURE),
    SMTP_USER: emptyToUndefined(process.env.SMTP_USER),
    SMTP_PASSWORD: emptyToUndefined(process.env.SMTP_PASSWORD),
    STORAGE_BACKEND: emptyToUndefined(process.env.STORAGE_BACKEND),
    UPLOAD_DIR: emptyToUndefined(process.env.UPLOAD_DIR),
    SUPABASE_URL: emptyToUndefined(process.env.SUPABASE_URL),
    SUPABASE_SECRET_KEY: emptyToUndefined(process.env.SUPABASE_SECRET_KEY),
    SUPABASE_STORAGE_BUCKET: emptyToUndefined(process.env.SUPABASE_STORAGE_BUCKET),
    INITIAL_EXECUTIVE_USERNAME: emptyToUndefined(process.env.INITIAL_EXECUTIVE_USERNAME),
    INITIAL_EXECUTIVE_NAME: emptyToUndefined(process.env.INITIAL_EXECUTIVE_NAME),
    INITIAL_EXECUTIVE_PASSWORD: emptyToUndefined(process.env.INITIAL_EXECUTIVE_PASSWORD),
    INITIAL_EXECUTIVE_EMAIL: emptyToUndefined(process.env.INITIAL_EXECUTIVE_EMAIL),
    GROQ_API_KEY: emptyToUndefined(process.env.GROQ_API_KEY),
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}

/** Test helper: forget the memoized environment so a new one can be parsed. */
export function resetEnvCache(): void {
  cached = null;
}
