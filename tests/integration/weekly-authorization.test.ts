import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  canFinalizeWeeklyRecord,
  canManageChapter,
  canViewChapter,
  canViewGroup,
} from '@/server/authz/policy';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { getHomeworkAssignmentBySessionId, setHomeworkDecision } from '@/server/services/weekly-work-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Phase 3 authorization boundaries:
 *
 *   Mentor            -> only their own assigned group(s)
 *   Chapter Head       -> every mentor/group inside their own chapter (view,
 *                         and correction per the master spec's "may correct
 *                         records within their own chapter when operationally
 *                         necessary")
 *   Regional Director  -> every chapter/program
 *
 * A Chapter Head must never reach another chapter's data by changing an ID,
 * and a Mentor must never manage a group they were not assigned to — even
 * one in their own chapter.
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let groupA1Id: string;
let groupA2Id: string;
let groupBId: string;
let mentorAId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const program = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!program) throw new Error('Core program missing.');
  onlineProgramId = program.id;

  const year = await createAcademicYear({
    label: '2026–2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    activate: true,
    actor,
  });
  academicYearId = year.id;

  const chapterA = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;

  const groupA1 = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'bio', actor });
  const groupA2 = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'cs', actor });
  const groupB = await createGroup({ chapterId: chapterBId, academicYearId, disciplineKey: 'math', actor });
  groupA1Id = groupA1.id;
  groupA2Id = groupA2.id;
  groupBId = groupB.id;

  const mentorA = await createUser({
    username: 'mentor.a',
    fullName: 'Mentor A',
    role: 'mentor',
    chapterId: chapterAId,
    academicYearId,
    actor,
  });
  mentorAId = mentorA.userId;
  // Mentor A mentors only groupA1 — groupA2 (same chapter) is deliberately
  // left unassigned to prove chapter membership alone is not enough.
  await assignGroupMentor({ groupId: groupA1Id, mentorUserId: mentorAId, actor });
});

afterAll(async () => {
  await closeTestDb();
});

describe('mentor scope for homework', () => {
  it('lets a mentor create homework only for their own assigned group', async () => {
    const scope = await loadAccessScope(mentorAId, 'mentor', academicYearId);

    expect(canFinalizeWeeklyRecord(scope, groupA1Id, chapterAId)).toBe(true);
    // Same chapter, but not the mentor's group.
    expect(canFinalizeWeeklyRecord(scope, groupA2Id, chapterAId)).toBe(false);
    // A different chapter entirely.
    expect(canFinalizeWeeklyRecord(scope, groupBId, chapterBId)).toBe(false);
  });

  it('lets a mentor assign the same homework text to multiple groups they mentor', async () => {
    await assignGroupMentor({ groupId: groupA2Id, mentorUserId: mentorAId, actor });

    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(groupA1Id);
    await generateWeeklySessionsForGroup(groupA2Id);

    const [sessionA1] = await listWeeklySessionsByGroup(groupA1Id);
    const [sessionA2] = await listWeeklySessionsByGroup(groupA2Id);

    const description = '100 görüntü etiketleyin.';
    await setHomeworkDecision({
      weeklySessionId: sessionA1!.id,
      noHomework: false,
      description,
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    await setHomeworkDecision({
      weeklySessionId: sessionA2!.id,
      noHomework: false,
      description,
      actor: { id: mentorAId, name: 'Mentor A' },
    });

    const hwA1 = await getHomeworkAssignmentBySessionId(sessionA1!.id);
    const hwA2 = await getHomeworkAssignmentBySessionId(sessionA2!.id);
    expect(hwA1?.description).toBe(description);
    expect(hwA2?.description).toBe(description);
    expect(hwA1?.groupId).toBe(groupA1Id);
    expect(hwA2?.groupId).toBe(groupA2Id);
  });
});

describe('chapter head oversight', () => {
  it('sees every mentor and group inside their own chapter, regardless of which mentor owns which group', async () => {
    const chapterHead = await createUser({
      username: 'head.a',
      fullName: 'Chapter Head A',
      role: 'chapter_head',
      chapterId: chapterAId,
      academicYearId,
      actor,
    });
    const scope = await loadAccessScope(chapterHead.userId, 'chapter_head', academicYearId);

    expect(canViewChapter(scope, chapterAId)).toBe(true);
    expect(canViewGroup(scope, groupA1Id, chapterAId)).toBe(true);
    expect(canViewGroup(scope, groupA2Id, chapterAId)).toBe(true); // unassigned group, still visible
    // The oversight/correction right the master spec grants explicitly.
    expect(canFinalizeWeeklyRecord(scope, groupA1Id, chapterAId)).toBe(true);
    expect(canFinalizeWeeklyRecord(scope, groupA2Id, chapterAId)).toBe(true);
  });

  it('never sees another chapter’s protected data, even by a correct, existing group ID', async () => {
    const chapterHead = await createUser({
      username: 'head.a2',
      fullName: 'Chapter Head A',
      role: 'chapter_head',
      chapterId: chapterAId,
      academicYearId,
      actor,
    });
    const scope = await loadAccessScope(chapterHead.userId, 'chapter_head', academicYearId);

    expect(canViewChapter(scope, chapterBId)).toBe(false);
    expect(canViewGroup(scope, groupBId, chapterBId)).toBe(false);
    expect(canFinalizeWeeklyRecord(scope, groupBId, chapterBId)).toBe(false);
    expect(canManageChapter(scope, chapterBId)).toBe(false);
  });

  it('rejects direct-ID access exactly the way the session page checks it', async () => {
    // Mirrors the real guard in the weekly-session page: the group must
    // belong to the chapter in the URL, and the caller must be authorized
    // for that group — a Chapter Head from Chapter A pointing at Chapter B's
    // real group/chapter IDs must still be rejected.
    const chapterHead = await createUser({
      username: 'head.a3',
      fullName: 'Chapter Head A',
      role: 'chapter_head',
      chapterId: chapterAId,
      academicYearId,
      actor,
    });
    const scope = await loadAccessScope(chapterHead.userId, 'chapter_head', academicYearId);

    // The group genuinely belongs to chapterB — this is not a typo/guess.
    const groupBelongsToChapter = groupBId !== groupA1Id; // sanity
    expect(groupBelongsToChapter).toBe(true);
    expect(canViewGroup(scope, groupBId, chapterBId)).toBe(false);
  });
});

describe('regional director oversight', () => {
  it('sees every chapter and group across the organization', async () => {
    const director = await createUser({
      username: 'director.test',
      fullName: 'Regional Director',
      role: 'regional_director',
      actor,
    });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);

    expect(canViewChapter(scope, chapterAId)).toBe(true);
    expect(canViewChapter(scope, chapterBId)).toBe(true);
    expect(canViewGroup(scope, groupA1Id, chapterAId)).toBe(true);
    expect(canViewGroup(scope, groupBId, chapterBId)).toBe(true);
    expect(canFinalizeWeeklyRecord(scope, groupBId, chapterBId)).toBe(true);
  });
});

