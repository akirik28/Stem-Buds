import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const DATABASE_BACKED_PUBLIC_PAGES = [
  'src/app/page.tsx',
  'src/app/haberler/page.tsx',
  'src/app/haberler/[slug]/page.tsx',
] as const;

describe('database-backed public page runtime', () => {
  it.each(DATABASE_BACKED_PUBLIC_PAGES)(
    '%s is rendered dynamically instead of querying PostgreSQL during build',
    (relativePath) => {
      const source = readFileSync(path.join(process.cwd(), relativePath), 'utf8');

      expect(source).toContain("export const dynamic = 'force-dynamic'");
      expect(source).not.toMatch(/export const revalidate\s*=\s*[1-9]/);
    },
  );
});
