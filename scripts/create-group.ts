import './load-env';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { academicYears, chapters, users } from '../src/server/db/schema';
import { addGroupMember, assignGroupMentor, createGroup } from '../src/server/services/group-service';
import { disciplineLabels, type DisciplineKey } from '../src/lib/i18n/tr';

/**
 * Opens a group, and optionally staffs it, in one command.
 *
 * Creating a group, assigning its mentor and adding its students were three
 * separate screens for work that always happens at once, at the start of a
 * year. Here they are one line, addressed by the names people actually use
 * — a chapter code, a username — rather than ids.
 *
 * The group's own name is not an argument: it is derived from the
 * discipline and the next free number in that chapter, so two people
 * setting up groups can never disagree about what to call the third
 * Matematik group.
 */
const actor = { id: null, name: 'cli' };

async function main() {
  const { values } = parseArgs({
    options: {
      chapter: { type: 'string' },
      ders: { type: 'string' },
      mentor: { type: 'string' },
      students: { type: 'string' },
    },
  });

  const { chapter, ders, mentor, students } = values;
  const disciplines = Object.keys(disciplineLabels) as DisciplineKey[];

  if (!chapter || !ders) {
    console.log('Kullanım:');
    console.log('  npx tsx scripts/create-group.ts --chapter MATH --ders math [--mentor kullanici.adi] [--students a.b,c.d]');
    console.log(`\nDersler: ${disciplines.map((key) => `${key} (${disciplineLabels[key]})`).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (!disciplines.includes(ders as DisciplineKey)) {
    console.log(`Geçersiz ders: ${ders}\nDersler: ${disciplines.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const db = getDb();

  const [year] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  if (!year) {
    console.log('Aktif akademik yıl yok.');
    process.exitCode = 1;
    return;
  }

  const [chapterRow] = await db.select().from(chapters).where(eq(chapters.code, chapter)).limit(1);
  if (!chapterRow) {
    console.log(`"${chapter}" kodlu chapter bulunamadı.`);
    process.exitCode = 1;
    return;
  }

  /** Resolves a username to an id, so the caller never handles a uuid. */
  const findUser = async (username: string) => {
    const [row] = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.username, username.trim()))
      .limit(1);
    return row ?? null;
  };

  const group = await createGroup({
    chapterId: chapterRow.id,
    academicYearId: year.id,
    disciplineKey: ders as DisciplineKey,
    actor,
  });
  console.log(`\nGrup açıldı: ${group.name} — ${chapterRow.code} ${chapterRow.name}`);

  if (mentor) {
    const row = await findUser(mentor);
    if (!row) {
      console.log(`Mentor bulunamadı: ${mentor} (grup açıldı, mentor atanmadı)`);
    } else {
      await assignGroupMentor({ groupId: group.id, mentorUserId: row.id, actor });
      console.log(`Mentor      : ${row.fullName}`);
    }
  }

  if (students) {
    const usernames = students.split(',').map((s) => s.trim()).filter(Boolean);
    for (const username of usernames) {
      const row = await findUser(username);
      if (!row) {
        console.log(`Öğrenci bulunamadı: ${username}`);
        continue;
      }
      await addGroupMember({ groupId: group.id, userId: row.id, role: 'student', actor });
      console.log(`Öğrenci     : ${row.fullName}`);
    }
  }

  console.log('\nOturumları panelden "Oturumları Oluştur" ile üretebilirsiniz.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
