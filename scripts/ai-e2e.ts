import './load-env';
import { loadAccessScope } from '../src/server/auth/context';
import { getWeeklySummaryInsight } from '../src/server/services/management-ai';
import { getActiveAcademicYear } from '../src/server/services/academic-year';
import { getDb, closeDb } from '../src/server/db';
import { users } from '../src/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * End-to-end check of one AI surface against real seeded data: loads a real
 * Executive's scope, builds the real facts from the database, calls the
 * configured provider and validates the answer — the same path the panel
 * takes, minus the HTTP layer.
 *
 * Refuses to run against anything but a local database: this writes an
 * `ai_insights` cache row and an audit entry.
 */
async function main(): Promise<void> {
  const host = new URL(process.env.DATABASE_URL ?? '').hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
    throw new Error(`Refusing to run against a non-local database (host: ${host}).`);
  }

  const username = process.argv[2] ?? 'direktor';
  const [user] = await getDb().select().from(users).where(eq(users.username, username)).limit(1);
  if (!user) throw new Error(`No such user: ${username}`);

  const year = await getActiveAcademicYear();
  const scope = await loadAccessScope(user.id, user.role, year?.id ?? null);

  const startedAt = Date.now();
  const outcome = await getWeeklySummaryInsight(scope, null, { id: user.id, name: user.fullName });
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  process.stdout.write(`durum: ${outcome.status} · ${elapsed}s\n\n`);
  if (outcome.status !== 'ok') {
    process.stdout.write(`${JSON.stringify(outcome, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const { insight } = outcome;
  process.stdout.write(`ÖZET\n${insight.summary}\n\n`);
  process.stdout.write(`OLUMLU\n${insight.positives.map((p) => `  · ${p}`).join('\n')}\n\n`);
  process.stdout.write(
    `DİKKAT\n${insight.attentionItems.map((a) => `  · ${a.title}\n    ${a.evidence}`).join('\n')}\n\n`,
  );
  process.stdout.write(`AKSİYON\n${insight.recommendedActions.map((r) => `  · ${r}`).join('\n')}\n`);
}

main()
  .catch((e: unknown) => {
    process.stdout.write(`HATA: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
