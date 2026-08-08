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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TEST_DATABASE_URL: z.string().optional(),

  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_TIMEZONE: z.string().min(1).default('Europe/Istanbul'),
  SESSION_COOKIE_NAME: z.string().min(1).default('sb_session'),
  SESSION_COOKIE_SECURE: booleanish.default(false),

  BOOTSTRAP_TOKEN: z.string().optional(),
  JOB_RUNNER_TOKEN: z.string().optional(),

  EMAIL_TRANSPORT: z.enum(['mock', 'smtp']).default('mock'),
  EMAIL_FROM_NAME: z.string().default('STEM & BUDS'),
  EMAIL_FROM_ADDRESS: z.string().default('stemandbuds01@gmail.com'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: booleanish.default(true),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  UPLOAD_DIR: z.string().default('./storage'),
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
    EMAIL_TRANSPORT: emptyToUndefined(process.env.EMAIL_TRANSPORT),
    EMAIL_FROM_NAME: emptyToUndefined(process.env.EMAIL_FROM_NAME),
    EMAIL_FROM_ADDRESS: emptyToUndefined(process.env.EMAIL_FROM_ADDRESS),
    SMTP_HOST: emptyToUndefined(process.env.SMTP_HOST),
    SMTP_PORT: emptyToUndefined(process.env.SMTP_PORT),
    SMTP_SECURE: emptyToUndefined(process.env.SMTP_SECURE),
    SMTP_USER: emptyToUndefined(process.env.SMTP_USER),
    SMTP_PASSWORD: emptyToUndefined(process.env.SMTP_PASSWORD),
    UPLOAD_DIR: emptyToUndefined(process.env.UPLOAD_DIR),
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
