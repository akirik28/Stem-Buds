import './load-env';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { programs } from '../src/server/db/schema';
import { createChapter } from '../src/server/services/chapter-service';

/**
 * Opens a chapter from the command line.
 *
 * A chapter here is a subject — Matematik, Kimya — and the groups inside it
 * are that subject's groups. The program is named by its key rather than an
 * id, so the command reads the way the structure is spoken about.
 */
async function main() {
  const { values } = parseArgs({
    options: {
      program: { type: 'string' },
      code: { type: 'string' },
      name: { type: 'string' },
      city: { type: 'string' },
    },
  });

  const { program, code, name, city } = values;
  if (!program || !code || !name) {
    console.log('Kullanım:');
    console.log('  npx tsx scripts/create-chapter.ts --program online_middle_school --code MATH --name "Matematik"');
    process.exitCode = 1;
    return;
  }

  const db = getDb();
  const [programRow] = await db.select().from(programs).where(eq(programs.key, program)).limit(1);
  if (!programRow) {
    const all = await db.select({ key: programs.key }).from(programs);
    console.log(`"${program}" anahtarlı program yok. Mevcut: ${all.map((p) => p.key).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const chapter = await createChapter({
    programId: programRow.id,
    code,
    name,
    city: city ?? null,
    actor: { id: null, name: 'cli' },
  });
  console.log(`Chapter açıldı: ${chapter.code} — ${chapter.name} (${programRow.shortName})`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeDb());
