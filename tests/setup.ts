import { config } from 'dotenv';

/**
 * Test environment bootstrap.
 *
 * `NODE_ENV=test` makes `getEnv()` resolve DATABASE_URL from TEST_DATABASE_URL,
 * so the suite can never touch the development or production database.
 */
config({ path: ['.env.local', '.env'], quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Copy .env.example to .env.local and point it at a dedicated test database.',
  );
}
