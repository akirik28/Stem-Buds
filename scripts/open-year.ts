import './load-env';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { programs } from '../src/server/db/schema';
import { createAcademicYear } from '../src/server/services/academic-year';
import { updateProgramSchedule } from '../src/server/services/program-service';

/**
 * Opens an academic year and sets a programme's weekly slot in one go.
 *
 * These two are one decision in practice: the year's span and the weekday
 * together decide how many sessions exist, because generation walks every
 * matching weekday between the two dates. Twelve sessions is a twelve-week
 * year, not a school year with forty of them cancelled.
 */
const DAYS = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

async function main() {
  const { values } = parseArgs({
    options: {
      label: { type: 'string' },
      start: { type: 'string' },
      end: { type: 'string' },
      program: { type: 'string' },
      day: { type: 'string' },
      time: { type: 'string' },
      minutes: { type: 'string' },
    },
  });

  const { label, start, end, program, day, time, minutes } = values;
  if (!label || !start || !end) {
    console.log('Kullanım:');
    console.log('  npx tsx scripts/open-year.ts --label "2026–2027" --start 2026-10-04 --end 2026-12-21 \\');
    console.log('    --program online_middle_school --day 7 --time 19:00 --minutes 60');
    console.log('\n  --day: 1 Pazartesi … 7 Pazar');
    process.exitCode = 1;
    return;
  }

  const actor = { id: null, name: 'cli' };
  const year = await createAcademicYear({ label, startDate: start, endDate: end, activate: true, actor });
  console.log(`Akademik yıl açıldı ve aktifleştirildi: ${year.label} (${start} → ${end})`);

  if (!program) {
    console.log('Program ayarı girilmedi; oturum üretilebilmesi için gün/saat gerekiyor.');
    return;
  }

  const db = getDb();
  const [programRow] = await db.select().from(programs).where(eq(programs.key, program)).limit(1);
  if (!programRow) {
    console.log(`"${program}" anahtarlı program yok.`);
    process.exitCode = 1;
    return;
  }

  const dayOfWeek = day ? Number(day) : null;
  const [hours = 0, mins = 0] = (time ?? '').split(':').map(Number);
  const startMinute = time ? hours * 60 + mins : null;

  await updateProgramSchedule({
    programId: programRow.id,
    weeklyDayOfWeek: dayOfWeek,
    weeklyStartMinute: startMinute,
    weeklyDurationMinutes: minutes ? Number(minutes) : null,
    timezone: 'Europe/Istanbul',
    actor,
  });

  console.log(
    `${programRow.shortName}: her ${DAYS[dayOfWeek ?? 0]} ${time}, ${minutes} dakika (Europe/Istanbul)`,
  );
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => closeDb());
