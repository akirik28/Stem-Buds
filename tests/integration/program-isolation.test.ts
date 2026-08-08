import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapters, groups, managementAlerts } from '@/server/db/schema';
import {
  ensureCorePrograms,
  getOrCreateProgramSettings,
  getProgramByKey,
  listPrograms,
  updateProgramSchedule,
} from '@/server/services/program-service';
import { createChapter, listChapters } from '@/server/services/chapter-service';
import { createGroup, listGroupsByProgram } from '@/server/services/group-service';
import { createAcademicYear } from '@/server/services/academic-year';
import { canViewChapter, canViewGroup, type AccessScope } from '@/server/authz/policy';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Program A (Online Ortaokul Programı) / Program B (BİLSEM Programı)
 * isolation.
 *
 * These tests exist because STEM & BUDS is one organization running two
 * programs that must never bleed into each other: a Chapter Head or mentor
 * scoped to one program's chapter must never reach the other program's data,
 * and a Group can never disagree with its own Chapter about which program it
 * belongs to — enforced by the database itself (composite foreign keys), not
 * only by the service layer.
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let bilsemProgramId: string;
let academicYearId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
  if (!online || !bilsem) throw new Error('Core programs missing after resetDatabase().');
  onlineProgramId = online.id;
  bilsemProgramId = bilsem.id;

  const year = await createAcademicYear({
    label: '2026–2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    activate: true,
    actor,
  });
  academicYearId = year.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe('core program seeding', () => {
  it('creates exactly the two programs, idempotently', async () => {
    const programs = await listPrograms();
    expect(programs.map((p) => p.key).sort()).toEqual([PROGRAM_KEYS.bilsem, PROGRAM_KEYS.onlineMiddleSchool].sort());

    // Calling it again must not create duplicates or throw.
    await ensureCorePrograms();
    expect(await listPrograms()).toHaveLength(2);
  });

  it('never treats BİLSEM as a chapter of the online program', async () => {
    const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
    expect(bilsem).not.toBeNull();
    expect(bilsem?.name).toBe('BİLSEM Programı');
    // It is a first-class program, not a row in `chapters`.
    const chapterRows = await getDb().select().from(chapters);
    expect(chapterRows).toHaveLength(0);
  });
});

describe('chapter and group program scoping', () => {
  it('requires a program to create a chapter', async () => {
    await expect(
      createChapter({ programId: '', code: 'XXX', name: 'Test Chapter', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('scopes a group to its chapter’s program automatically', async () => {
    const chapter = await createChapter({
      programId: onlineProgramId,
      code: 'UAA',
      name: 'Üsküdar Amerikan Akademisi',
      actor,
    });

    const group = await createGroup({
      chapterId: chapter.id,
      academicYearId,
      disciplineKey: 'bio',
      actor,
    });

    expect(group.programId).toBe(onlineProgramId);
    expect(group.name).toBe('Bio 1');
  });

  it('filters chapters and groups by program without leaking the other program', async () => {
    const onlineChapter = await createChapter({
      programId: onlineProgramId,
      code: 'UAA',
      name: 'Online Chapter',
      actor,
    });
    const bilsemChapter = await createChapter({
      programId: bilsemProgramId,
      code: 'BLS1',
      name: 'BİLSEM Ankara',
      actor,
    });
    await createGroup({ chapterId: onlineChapter.id, academicYearId, disciplineKey: 'bio', actor });
    await createGroup({ chapterId: bilsemChapter.id, academicYearId, disciplineKey: 'cs', actor });

    const onlineChapters = await listChapters({ programId: onlineProgramId });
    expect(onlineChapters.map((c) => c.code)).toEqual(['UAA']);

    const bilsemChapters = await listChapters({ programId: bilsemProgramId });
    expect(bilsemChapters.map((c) => c.code)).toEqual(['BLS1']);

    const onlineGroups = await listGroupsByProgram(onlineProgramId, academicYearId);
    expect(onlineGroups).toHaveLength(1);
    const bilsemGroups = await listGroupsByProgram(bilsemProgramId, academicYearId);
    expect(bilsemGroups).toHaveLength(1);
    expect(onlineGroups[0]?.id).not.toBe(bilsemGroups[0]?.id);
  });

  it('rejects at the database level a group whose program disagrees with its chapter', async () => {
    const chapter = await createChapter({
      programId: onlineProgramId,
      code: 'UAA',
      name: 'Online Chapter',
      actor,
    });

    // Bypass the service layer entirely and attempt the impossible
    // combination directly — the composite foreign key on
    // groups(chapter_id, program_id) -> chapters(id, program_id) must reject
    // it regardless of what application code does or doesn't validate.
    await expect(
      getDb()
        .insert(groups)
        .values({
          chapterId: chapter.id,
          programId: bilsemProgramId,
          academicYearId,
          disciplineKey: 'cs',
          sequence: 1,
          name: 'CS 1',
        }),
    ).rejects.toThrow();

    const survivingGroups = await getDb().select().from(groups).where(eq(groups.chapterId, chapter.id));
    expect(survivingGroups).toHaveLength(0);
  });

  it('rejects a management alert whose chapter disagrees with its own programId', async () => {
    const chapter = await createChapter({
      programId: onlineProgramId,
      code: 'UAA',
      name: 'Online Chapter',
      actor,
    });

    await expect(
      getDb()
        .insert(managementAlerts)
        .values({
          fingerprint: 'test-fingerprint',
          tab: 'weekly',
          severity: 'red',
          programId: bilsemProgramId,
          academicYearId,
          chapterId: chapter.id,
          title: 'Test',
          detail: 'Test',
        }),
    ).rejects.toThrow();
  });
});

describe('authorization stays program-aware through chapter/group scope', () => {
  it('keeps a chapter head confined to their own program’s chapter', async () => {
    const onlineChapter = await createChapter({
      programId: onlineProgramId,
      code: 'UAA',
      name: 'Online Chapter',
      actor,
    });
    const bilsemChapter = await createChapter({
      programId: bilsemProgramId,
      code: 'BLS1',
      name: 'BİLSEM Ankara',
      actor,
    });
    const onlineGroup = await createGroup({
      chapterId: onlineChapter.id,
      academicYearId,
      disciplineKey: 'bio',
      actor,
    });
    const bilsemGroup = await createGroup({
      chapterId: bilsemChapter.id,
      academicYearId,
      disciplineKey: 'cs',
      actor,
    });

    const headScope: AccessScope = {
      userId: 'head-online',
      role: 'chapter_head',
      headChapterIds: [onlineChapter.id],
      memberChapterIds: [onlineChapter.id],
      mentorGroupIds: [],
      studentGroupIds: [],
      teamLeaderGroupIds: [],
      advisorProgramIds: [],
      advisorChapterIds: [],
    };

    expect(canViewChapter(headScope, onlineChapter.id)).toBe(true);
    expect(canViewChapter(headScope, bilsemChapter.id)).toBe(false);
    expect(canViewGroup(headScope, onlineGroup.id, onlineChapter.id)).toBe(true);
    expect(canViewGroup(headScope, bilsemGroup.id, bilsemChapter.id)).toBe(false);
  });
});

describe('per-program settings never leak into each other', () => {
  it('creates independent settings rows for each program', async () => {
    const onlineSettings = await getOrCreateProgramSettings(onlineProgramId);
    const bilsemSettings = await getOrCreateProgramSettings(bilsemProgramId);

    expect(onlineSettings.id).not.toBe(bilsemSettings.id);
    expect(onlineSettings.weeklyDayOfWeek).toBeNull();
    expect(bilsemSettings.weeklyDayOfWeek).toBeNull();
    expect(onlineSettings.cycleLengthWeeks).toBeNull();
  });

  it('configuring the online program’s schedule does not affect BİLSEM’s', async () => {
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 11 * 60,
      weeklyDurationMinutes: 60,
      cycleLengthWeeks: 10,
      actor,
    });

    const onlineSettings = await getOrCreateProgramSettings(onlineProgramId);
    const bilsemSettings = await getOrCreateProgramSettings(bilsemProgramId);

    expect(onlineSettings.weeklyDayOfWeek).toBe(6);
    expect(onlineSettings.cycleLengthWeeks).toBe(10);
    // BİLSEM must still show "not configured yet" — Program A's 10-week,
    // Saturday-11:00 assumption must never leak into it.
    expect(bilsemSettings.weeklyDayOfWeek).toBeNull();
    expect(bilsemSettings.cycleLengthWeeks).toBeNull();
  });

  it('rejects a second settings row for the same program', async () => {
    await getOrCreateProgramSettings(onlineProgramId);
    const db = getDb();
    const { programSettings } = await import('@/server/db/schema');
    await expect(
      db.insert(programSettings).values({ programId: onlineProgramId }),
    ).rejects.toThrow();
  });
});
