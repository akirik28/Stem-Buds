import { config } from 'dotenv';

/**
 * Loads environment files for standalone scripts in the same order Next.js uses:
 * `.env.local` wins over `.env`. Real deployments provide variables directly and
 * simply have no files to load.
 */
config({ path: ['.env.local', '.env'], quiet: true });
