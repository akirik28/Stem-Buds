import './load-env';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { chapters, academicYears, users } from '../src/server/db/schema';
import { createUser } from '../src/server/services/user-admin';
import type { UserRole } from '../src/server/authz/policy';

/**
 * Creates an account from the command line.
 *
 * The panel no longer offers a creation form — accounts are opened from here
 * instead, deliberately, so that the one screen everybody uses stays about
 * running the programme rather than administering it.
 *
 * A chapter is named by its code, not its id, because the id is not
 * something anybody has to hand. The academic year is whichever one is
 * active; a member row is only written when a chapter is given.
 *
 * The temporary password is printed once and never stored anywhere legible
 * — the same contract the panel's own reveal has. Hand it over yourself.
 */
const ROLES = [
  'regional_director',
  'vice_president',
  'chapter_head',
  'mentor',
  'student',
  'parent',
  'advisor_teacher',
] as const;

async function main() {
  const { values } = parseArgs({
    options: {
      username: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string' },
      chapter: { type: 'string' },
      email: { type: 'string' },
      child: { type: 'string' },
    },
  });

  const { username, name, role, chapter, email, child } = values;

  if (!username || !name || !role) {
    console.log('Kullanım:');
    console.log('  npx tsx scripts/create-user.ts --username ada.kirik --name "Ada Kırık" --role mentor [--chapter MATH] [--email a@b.com] [--child ogrenci.kullanici]');
    console.log(`\nRoller: ${ROLES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  if (!(ROLES as readonly string[]).includes(role)) {
    console.log(`Geçersiz rol: ${role}\nRoller: ${ROLES.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const db = getDb();

  const [year] = await db.select().from(academicYears).where(eq(academicYears.isActive, true)).limit(1);
  if (!year) {
    console.log('Aktif akademik yıl yok. Önce panelden bir akademik yıl açıp aktifleştirin.');
    process.exitCode = 1;
    return;
  }

  let chapterId: string | null = null;
  if (chapter) {
    const [row] = await db.select().from(chapters).where(eq(chapters.code, chapter)).limit(1);
    if (!row) {
      console.log(`"${chapter}" kodlu chapter bulunamadı.`);
      process.exitCode = 1;
      return;
    }
    chapterId = row.id;
  }

  let parentOfStudentUserIds: string[] | undefined;
  if (child) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, child)).limit(1);
    if (!row) {
      console.log(`"${child}" kullanıcı adlı öğrenci bulunamadı.`);
      process.exitCode = 1;
      return;
    }
    parentOfStudentUserIds = [row.id];
  }

  const result = await createUser({
    username,
    fullName: name,
    role: role as UserRole,
    notificationEmail: email ?? null,
    chapterId,
    academicYearId: chapterId ? year.id : null,
    parentOfStudentUserIds,
    actor: { id: null, name: 'cli' },
  });

  console.log(`\nHesap açıldı: ${name} (${role})`);
  console.log(`Kullanıcı adı : ${result.username}`);
  console.log(`Geçici şifre  : ${result.temporaryPassword}`);
  console.log('\nBu şifre bir daha gösterilmeyecek. Kişiye kendiniz iletin; ilk girişte değiştirmesi istenecek.');
  if (email) console.log(`Bilgilendirme e-postası ${email} adresine gönderildi.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
