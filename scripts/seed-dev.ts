import './load-env';
import { eq, inArray } from 'drizzle-orm';
import { closeDb, getDb } from '../src/server/db';
import { users } from '../src/server/db/schema';
import { ensureCorePrograms, getProgramByKey, updateProgramSchedule } from '../src/server/services/program-service';
import { PROGRAM_KEYS } from '../src/server/domain/program';
import { createAcademicYear, getActiveAcademicYear } from '../src/server/services/academic-year';
import { createChapter, listChapters } from '../src/server/services/chapter-service';
import { createUser, listUsers } from '../src/server/services/user-admin';
import {
  addGroupMember,
  assignGroupMentor,
  createGroup,
  listGroupMembers,
} from '../src/server/services/group-service';
import { addMilestone, createProject, updateMilestoneStatus } from '../src/server/services/project-service';
import { upsertLeadershipProfile } from '../src/server/services/public-site-admin-service';
import {
  generateWeeklySessionsForGroup,
  listWeeklySessionsByGroup,
} from '../src/server/services/weekly-session-service';
import {
  finalizeAttendance,
  setHomeworkDecision,
  updateWorkLogNarrative,
  approveWeeklySession,
  finalizePreviousHomeworkResults,
} from '../src/server/services/weekly-work-service';
import type { DisciplineKey } from '../src/lib/i18n/tr';

/**
 * Development seed: a small but complete organization, so every screen has
 * something real to render and every role has something to look at.
 *
 * Deliberately NOT idempotent-by-design the way the production bootstrap is —
 * this creates demo people and demo history, which must never reach a real
 * deployment. The guard below is the only thing standing between the two, so
 * it refuses to run against anything that is not a local database.
 */

const DEMO_PASSWORD = 'StemBuds2026';
const ACTOR = { id: null, name: 'seed-dev' } as const;

function assertLocalDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!local) {
    throw new Error(
      `Refusing to seed demo data into a non-local database (host: ${host}).\n` +
        'Point DATABASE_URL at a local PostgreSQL database first.',
    );
  }
}

type SeededUser = { id: string; username: string; fullName: string; role: string };

async function makeUser(
  username: string,
  fullName: string,
  role: Parameters<typeof createUser>[0]['role'],
  extra: { chapterId?: string; academicYearId?: string; programIds?: string[] } = {},
): Promise<SeededUser> {
  const existing = (await listUsers()).find((u) => u.username === username);
  if (existing) return { id: existing.id, username, fullName, role };

  const created = await createUser({
    username,
    fullName,
    role,
    notificationEmail: `${username}@ornek.stembuds.org`,
    chapterId: extra.chapterId ?? null,
    academicYearId: extra.academicYearId ?? null,
    programIds: extra.programIds,
    temporaryPassword: DEMO_PASSWORD,
    actor: ACTOR,
  });
  return { id: created.userId, username, fullName, role };
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const db = getDb();

  console.log('· Programlar');
  await ensureCorePrograms(db);
  const ortaokul = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
  if (!ortaokul || !bilsem) throw new Error('Core programs missing.');

  // Both programs need a weekly slot before sessions can be generated, and
  // they get genuinely different ones — the product must never imply BİLSEM
  // inherits the Online Ortaokul shape.
  await updateProgramSchedule({
    programId: ortaokul.id,
    weeklyDayOfWeek: 3, // Çarşamba
    weeklyStartMinute: 18 * 60, // 18:00
    weeklyDurationMinutes: 60,
    cycleLengthWeeks: 10,
    actor: ACTOR,
  });
  await updateProgramSchedule({
    programId: bilsem.id,
    weeklyDayOfWeek: 6, // Cumartesi
    weeklyStartMinute: 10 * 60 + 30, // 10:30
    weeklyDurationMinutes: 90,
    cycleLengthWeeks: 14,
    actor: ACTOR,
  });

  console.log('· Akademik yıl');
  let year = await getActiveAcademicYear();
  if (!year) {
    year = await createAcademicYear({
      label: '2026–2027',
      startDate: '2026-09-14',
      endDate: '2027-06-18',
      activate: true,
      actor: ACTOR,
    });
  }

  console.log('· Chapter’lar');
  const chapterSeeds = [
    { programId: ortaokul.id, code: 'KAD', name: 'Kadıköy Anadolu Lisesi', city: 'İstanbul' },
    { programId: ortaokul.id, code: 'ANK', name: 'Ankara Fen Lisesi', city: 'Ankara' },
    { programId: bilsem.id, code: 'IZB', name: 'İzmir BİLSEM', city: 'İzmir' },
  ];
  const existingChapters = await listChapters();
  const chapters = [];
  for (const seed of chapterSeeds) {
    const found = existingChapters.find((c) => c.code === seed.code);
    chapters.push(found ?? (await createChapter({ ...seed, actor: ACTOR })));
  }
  const [kadikoy, ankara, izmir] = chapters;
  if (!kadikoy || !ankara || !izmir) throw new Error('Chapters missing.');

  console.log('· Kullanıcılar');
  await makeUser('direktor', 'Selin Akgün', 'regional_director');
  await makeUser('baskanyrd', 'Emre Doğan', 'vice_president');
  await makeUser('danisman', 'Ayşe Yıldırım', 'advisor_teacher', {
    programIds: [ortaokul.id, bilsem.id],
  });

  const heads = [
    await makeUser('kad.head', 'Deniz Arslan', 'chapter_head', { chapterId: kadikoy.id, academicYearId: year.id }),
    await makeUser('ank.head', 'Burak Şahin', 'chapter_head', { chapterId: ankara.id, academicYearId: year.id }),
    await makeUser('izb.head', 'Ece Korkmaz', 'chapter_head', { chapterId: izmir.id, academicYearId: year.id }),
  ];

  // chapter, disiplin, mentor, öğrenciler, proje
  const groupPlan: Array<{
    chapterId: string;
    chapterCode: string;
    discipline: DisciplineKey;
    mentor: { username: string; fullName: string };
    students: Array<{ username: string; fullName: string }>;
    project: { name: string; question: string };
  }> = [
    {
      chapterId: kadikoy.id,
      chapterCode: 'kad',
      discipline: 'bio',
      mentor: { username: 'kad.mentor1', fullName: 'Mert Yılmaz' },
      students: [
        { username: 'kad.ogr1', fullName: 'Zeynep Kaya' },
        { username: 'kad.ogr2', fullName: 'Ali Demir' },
        { username: 'kad.ogr3', fullName: 'Elif Çelik' },
        { username: 'kad.ogr4', fullName: 'Kerem Aydın' },
      ],
      project: {
        name: 'Okul bahçesinde toprak mikrobiyomu',
        question: 'Okul bahçesindeki farklı toprak bölgelerinde mikrobiyal çeşitlilik nasıl değişiyor?',
      },
    },
    {
      chapterId: kadikoy.id,
      chapterCode: 'kad',
      discipline: 'cs',
      mentor: { username: 'kad.mentor2', fullName: 'İrem Polat' },
      students: [
        { username: 'kad.ogr5', fullName: 'Can Öztürk' },
        { username: 'kad.ogr6', fullName: 'Nisa Erdoğan' },
        { username: 'kad.ogr7', fullName: 'Efe Kurt' },
      ],
      project: {
        name: 'Sınıf içi gürültü ölçen açık kaynak cihaz',
        question: 'Düşük maliyetli bir sensörle sınıf gürültüsü anlamlı biçimde ölçülebilir mi?',
      },
    },
    {
      chapterId: ankara.id,
      chapterCode: 'ank',
      discipline: 'math',
      mentor: { username: 'ank.mentor1', fullName: 'Ozan Bulut' },
      students: [
        { username: 'ank.ogr1', fullName: 'Duru Aksoy' },
        { username: 'ank.ogr2', fullName: 'Bora Tunç' },
        { username: 'ank.ogr3', fullName: 'Yaren Güneş' },
      ],
      project: {
        name: 'Şehir içi otobüs hatlarının grafik modeli',
        question: 'Ankara otobüs ağı bir grafik olarak modellenirse hangi duraklar kritik düğüm olur?',
      },
    },
    {
      chapterId: izmir.id,
      chapterCode: 'izb',
      discipline: 'eng',
      mentor: { username: 'izb.mentor1', fullName: 'Kaan Şen' },
      students: [
        { username: 'izb.ogr1', fullName: 'Melis Ateş' },
        { username: 'izb.ogr2', fullName: 'Arda Koç' },
        { username: 'izb.ogr3', fullName: 'Sude Bayraktar' },
        { username: 'izb.ogr4', fullName: 'Tuna Özdemir' },
      ],
      project: {
        name: 'Güneş enerjili sulama prototipi',
        question: 'Küçük ölçekli bir sera, güneş enerjisiyle kesintisiz sulanabilir mi?',
      },
    },
  ];

  console.log('· Gruplar, projeler, oturumlar');
  for (const plan of groupPlan) {
    const mentor = await makeUser(plan.mentor.username, plan.mentor.fullName, 'mentor', {
      chapterId: plan.chapterId,
      academicYearId: year.id,
    });

    const group = await createGroup({
      chapterId: plan.chapterId,
      academicYearId: year.id,
      disciplineKey: plan.discipline,
      actor: ACTOR,
    });
    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.id, actor: ACTOR });

    for (const [index, s] of plan.students.entries()) {
      const student = await makeUser(s.username, s.fullName, 'student', {
        chapterId: plan.chapterId,
        academicYearId: year.id,
      });
      await addGroupMember({
        groupId: group.id,
        userId: student.id,
        role: 'student',
        isTeamLeader: index === 0, // ilk öğrenci takım lideri
        actor: ACTOR,
      });
    }

    const project = await createProject({
      groupId: group.id,
      academicYearId: year.id,
      name: plan.project.name,
      researchQuestion: plan.project.question,
      shortDescription: 'Demo veri — geliştirme ortamı için üretildi.',
      startDate: '2026-09-21',
      actor: ACTOR,
    });

    const milestones = [
      { title: 'Araştırma sorusu belirlendi', done: true },
      { title: 'Literatür taraması', done: true },
      { title: 'Veri toplama', done: false },
      { title: 'Sonuç raporu', done: false },
    ];
    for (const m of milestones) {
      const created = await addMilestone({ projectId: project.id, title: m.title, actor: ACTOR });
      if (m.done) {
        await updateMilestoneStatus({ milestoneId: created.id, status: 'completed', actor: ACTOR });
      }
    }

    await generateWeeklySessionsForGroup(group.id);

    // İlk iki oturumu eksiksiz doldur, üçüncüyü kasten yarım bırak — mentorun
    // "eksik kayıt" deneyimi ve buradan doğan yönetim uyarısı da görünsün.
    const sessions = (await listWeeklySessionsByGroup(group.id)).slice(0, 3);
    const members = await listGroupMembers(group.id);
    const studentMemberships = members.filter((m) => m.role === 'student');

    for (const [i, session] of sessions.entries()) {
      const isComplete = i < 2;
      await updateWorkLogNarrative({
        weeklySessionId: session.id,
        whatWeDid:
          i === 0
            ? 'Araştırma sorusunu netleştirdik ve kaynak listesi çıkardık.'
            : 'Ölçüm yöntemini tartıştık, ilk denemeyi yaptık.',
        outputs: i === 0 ? 'Kaynak listesi (8 makale)' : 'İlk ölçüm verisi',
        problems: i === 1 ? 'Ölçüm cihazı beklenenden gürültülü sonuç verdi.' : null,
        nextWeekGoal: i === 0 ? 'Yöntemi seçmek' : 'Veriyi temizlemek',
        projectHealth: i === 1 ? 'attention' : 'on_track',
        actor: { id: mentor.id, name: mentor.fullName },
      });

      if (!isComplete) continue;

      // Geçen haftanın ödevi *bu* oturumda sonuçlanır — ilk hafta dışında her
      // oturumun tamamlanma koşullarından biri budur.
      if (i > 0) {
        await finalizePreviousHomeworkResults({
          weeklySessionId: session.id,
          statuses: studentMemberships.map((m, idx) => ({
            groupMembershipId: m.id,
            status: idx === 2 ? 'excused' : idx === 3 ? 'not_done' : 'done',
            note: null,
          })),
          actor: { id: mentor.id, name: mentor.fullName },
        });
      }

      await finalizeAttendance({
        weeklySessionId: session.id,
        records: studentMemberships.map((m, idx) => ({
          groupMembershipId: m.id,
          status: idx === 2 ? 'excused' : idx === 1 && i === 1 ? 'late' : 'present',
          note: idx === 2 ? 'Veli bilgilendirdi.' : null,
        })),
        actor: { id: mentor.id, name: mentor.fullName },
      });

      await setHomeworkDecision({
        weeklySessionId: session.id,
        noHomework: false,
        description: i === 0 ? 'Seçtiğiniz iki makaleyi özetleyin.' : 'Ölçüm tablosunu doldurun.',
        actor: { id: mentor.id, name: mentor.fullName },
      });

      await approveWeeklySession({
        weeklySessionId: session.id,
        actor: { id: mentor.id, name: mentor.fullName },
      });
    }
  }

  console.log('· Yönetim ekibi profilleri');
  const team = [
    { fullName: 'Selin Akgün', title: 'Regional Director', bio: 'Programın Türkiye genelindeki işleyişinden sorumlu. İki programın takvimini, chapter açılışlarını ve mentor eğitimini yürütüyor.' },
    { fullName: 'Emre Doğan', title: 'Vice Director', bio: 'Chapter başkanlarıyla haftalık takibi yürütür, proje yönlendirmesi ve raporlamadan sorumludur.' },
    { fullName: 'Deniz Arslan', title: 'Chapter Head — Kadıköy', bio: 'Kadıköy chapter’ındaki grupların kurulumu, mentor eşleştirmesi ve haftalık oturum takibini yapar.' },
    { fullName: 'Ayşe Yıldırım', title: 'Danışman Öğretmen', bio: 'Programın akademik danışmanı. Grup özetlerini izler, proje yöntemine dair geri bildirim verir.' },
  ];
  for (const [index, member] of team.entries()) {
    await upsertLeadershipProfile({
      fullName: member.fullName,
      title: member.title,
      bio: member.bio,
      displayOrder: index,
      isPublic: true,
      actor: ACTOR,
    });
  }

  // Demo hesapları doğrudan gezilebilsin diye geçici parola zorlamasını kaldır.
  const all = await listUsers();
  await db
    .update(users)
    .set({ mustChangePassword: false })
    .where(
      inArray(
        users.id,
        all.map((u) => u.id),
      ),
    );

  const executive = all.find((u) => u.username === 'direktor');
  if (executive) await db.update(users).set({ mustChangePassword: false }).where(eq(users.id, executive.id));

  console.log('\nDemo veri hazır. Tüm hesapların parolası: ' + DEMO_PASSWORD + '\n');
  console.log('  direktor     — Regional Director (her şeyi görür)');
  console.log('  baskanyrd    — Vice Director');
  console.log('  kad.head     — Chapter Head (Kadıköy)');
  console.log('  kad.mentor1  — Mentor (Bio 1)');
  console.log('  kad.ogr1     — Öğrenci + Takım Lideri');
  console.log('  danisman     — Danışman Öğretmen (her iki program)');
  console.log(`\n  (toplam ${all.length} hesap, ${heads.length} chapter head, ${groupPlan.length} grup)`);
}

main()
  .catch((error: unknown) => {
    console.error('\nSeed başarısız:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb().catch(() => undefined);
  });
