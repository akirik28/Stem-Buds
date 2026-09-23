import './load-env';
import { closeDb, getDb } from '../src/server/db';
import { academicYears, chapters, programs, programSettings, users } from '../src/server/db/schema';

/** Read-only look at what a deployment actually contains before changing it. */
async function main() {
  const db = getDb();
  const [years, chapterRows, programRows, settings, userRows] = await Promise.all([
    db.select().from(academicYears),
    db.select().from(chapters),
    db.select().from(programs),
    db.select().from(programSettings),
    db.select().from(users),
  ]);

  console.log('akademik yıl :', years.map((y) => `${y.label}${y.isActive ? ' (aktif)' : ''}`).join(', ') || 'YOK');
  console.log('program      :', programRows.map((p) => `${p.shortName} [${p.key}]`).join(', ') || 'YOK');
  console.log(
    'program ayarı:',
    settings.length
      ? settings.map((s) => `gün=${s.weeklyDayOfWeek} başlangıç=${s.weeklyStartMinute}dk süre=${s.weeklyDurationMinutes}dk`).join(' | ')
      : 'YOK',
  );
  console.log('chapter      :', chapterRows.map((c) => `${c.code} ${c.name}`).join(', ') || 'YOK');
  console.log('kullanıcı    :', userRows.length);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeDb());
