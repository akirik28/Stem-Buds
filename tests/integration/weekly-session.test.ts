import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { groupMemberships, weeklySessions } from '@/server/db/schema';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import {
  declareProgramHoliday,
  generateWeeklySessionsForGroup,
  listWeeklySessionsByGroup,
} from '@/server/services/weekly-session-service';
import {
  approveWeeklySession,
  finalizeAttendance,
  finalizePreviousHomeworkResults,
  getMissingRequirements,
  getOrCreateWorkLog,
  setHomeworkDecision,
  updateWorkLogNarrative,
} from '@/server/services/weekly-work-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterId: string;
let groupId: string;
let mentorId: string;
let studentMembershipIds: string[];

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

  const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
  chapterId = chapter.id;

  const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
  groupId = group.id;

  const mentor = await createUser({
    username: 'mentor.bio1',
    fullName: 'Mentor Bio',
    role: 'mentor',
    chapterId,
    academicYearId,
    actor,
  });
  mentorId = mentor.userId;
  await assignGroupMentor({ groupId, mentorUserId: mentorId, actor });

  const student1 = await createUser({
    username: 'ogrenci1',
    fullName: 'Öğrenci Bir',
    role: 'student',
    chapterId,
    academicYearId,
    actor,
  });
  const student2 = await createUser({
    username: 'ogrenci2',
    fullName: 'Öğrenci İki',
    role: 'student',
    chapterId,
    academicYearId,
    actor,
  });
  const { addGroupMember } = await import('@/server/services/group-service');
  await addGroupMember({ groupId, userId: student1.userId, role: 'student', actor });
  await addGroupMember({ groupId, userId: student2.userId, role: 'student', actor });

  const memberships = await getDb()
    .select({ id: groupMemberships.id, role: groupMemberships.role })
    .from(groupMemberships)
    .where(eq(groupMemberships.groupId, groupId));
  studentMembershipIds = memberships.filter((m) => m.role === 'student').map((m) => m.id);
});

afterAll(async () => {
  await closeTestDb();
});

describe('session generation', () => {
  it('creates nothing while the program schedule is unconfigured', async () => {
    const result = await generateWeeklySessionsForGroup(groupId);
    expect(result).toEqual({ created: 0, reason: 'not_configured' });
    expect(await listWeeklySessionsByGroup(groupId)).toHaveLength(0);
  });

  it('generates only future weekly slots once the program schedule is configured', async () => {
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6, // Saturday
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });

    const result = await generateWeeklySessionsForGroup(groupId);
    expect(result.created).toBeGreaterThan(0);

    const sessions = await listWeeklySessionsByGroup(groupId);
    const now = new Date();
    for (const session of sessions) {
      expect(session.scheduledStartAt.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(session.state).toBe('scheduled');
    }
    // Week numbers stay 1-based and strictly increasing.
    const numbers = sessions.map((s) => s.weekNumber);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it('is idempotent: running generation twice creates no duplicates', async () => {
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });

    const first = await generateWeeklySessionsForGroup(groupId);
    const second = await generateWeeklySessionsForGroup(groupId);

    expect(second.created).toBe(0);
    const sessions = await listWeeklySessionsByGroup(groupId);
    expect(sessions).toHaveLength(first.created);
  });

  it('marks a declared program holiday on already-generated sessions', async () => {
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(groupId);

    const sessions = await listWeeklySessionsByGroup(groupId);
    const target = sessions.find((s) => s.state === 'scheduled');
    expect(target).toBeDefined();

    const localDate = target!.scheduledStartAt.toISOString().slice(0, 10);
    const { sessionsUpdated } = await declareProgramHoliday({
      programId: onlineProgramId,
      academicYearId,
      holidayDate: localDate,
      reason: 'Yılbaşı tatili',
      actor,
    });
    expect(sessionsUpdated).toBeGreaterThanOrEqual(1);

    const [reloaded] = await getDb().select().from(weeklySessions).where(eq(weeklySessions.id, target!.id));
    expect(reloaded?.state).toBe('holiday');
    expect(reloaded?.cancellationReason).toBe('Yılbaşı tatili');
  });
});

describe('weekly work record completion', () => {
  async function makeSession() {
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(groupId);
    const sessions = await listWeeklySessionsByGroup(groupId);
    return sessions[0]!;
  }

  it('cannot be forged: completedAt stays null until every requirement is met server-side', async () => {
    const session = await makeSession();

    // Attempting to "complete" by just writing narrative fields, with nothing
    // else done, must not mark the session complete.
    await updateWorkLogNarrative({
      weeklySessionId: session.id,
      whatWeDid: 'Literatür taraması yaptık.',
      nextWeekGoal: 'Deney tasarımına başlayacağız.',
      projectHealth: 'on_track',
      actor,
    });

    let workLog = await getOrCreateWorkLog(session.id);
    expect(workLog.completedAt).toBeNull();

    const missing = await getMissingRequirements(session.id);
    expect(missing.map((m) => m.code)).toEqual(
      expect.arrayContaining(['attendance', 'homework_decision', 'mentor_approval']),
    );

    // Attendance.
    workLog = await finalizeAttendance({
      weeklySessionId: session.id,
      records: studentMembershipIds.map((id) => ({ groupMembershipId: id, status: 'present' as const })),
      actor,
    });
    expect(workLog.completedAt).toBeNull();

    // Homework decision.
    await setHomeworkDecision({ weeklySessionId: session.id, noHomework: true, actor });

    // Still missing mentor approval only.
    const stillMissing = await getMissingRequirements(session.id);
    expect(stillMissing.map((m) => m.code)).toEqual(['mentor_approval']);

    // Approval completes it.
    workLog = await approveWeeklySession({ weeklySessionId: session.id, actor });
    expect(workLog.completedAt).not.toBeNull();
  });

  it('refuses approval while requirements are still missing', async () => {
    const session = await makeSession();
    await expect(
      approveWeeklySession({ weeklySessionId: session.id, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('requires attendance for every active student, not a partial set', async () => {
    const session = await makeSession();
    await expect(
      finalizeAttendance({
        weeklySessionId: session.id,
        records: [{ groupMembershipId: studentMembershipIds[0]!, status: 'present' }],
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('enforces the no-homework/description exclusivity at the database level', async () => {
    const session = await makeSession();
    await expect(
      setHomeworkDecision({ weeklySessionId: session.id, noHomework: false, description: '', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('requires the previous week’s homework results before completion, only when one was due', async () => {
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(groupId);
    const sessions = await listWeeklySessionsByGroup(groupId);
    const [week1, week2] = sessions;
    expect(week1).toBeDefined();
    expect(week2).toBeDefined();

    // Week 1: assign homework due at week 2.
    await updateWorkLogNarrative({
      weeklySessionId: week1!.id,
      whatWeDid: 'x',
      nextWeekGoal: 'y',
      projectHealth: 'on_track',
      actor,
    });
    await finalizeAttendance({
      weeklySessionId: week1!.id,
      records: studentMembershipIds.map((id) => ({ groupMembershipId: id, status: 'present' as const })),
      actor,
    });
    await setHomeworkDecision({
      weeklySessionId: week1!.id,
      noHomework: false,
      description: '100 görüntü etiketle.',
      actor,
    });
    await approveWeeklySession({ weeklySessionId: week1!.id, actor });

    // Week 2: previous homework is now applicable and must be finalized.
    await updateWorkLogNarrative({
      weeklySessionId: week2!.id,
      whatWeDid: 'x',
      nextWeekGoal: 'y',
      projectHealth: 'on_track',
      actor,
    });
    await finalizeAttendance({
      weeklySessionId: week2!.id,
      records: studentMembershipIds.map((id) => ({ groupMembershipId: id, status: 'present' as const })),
      actor,
    });
    await setHomeworkDecision({ weeklySessionId: week2!.id, noHomework: true, actor });

    const missingBefore = await getMissingRequirements(week2!.id);
    expect(missingBefore.map((m) => m.code)).toContain('previous_homework_results');

    await finalizePreviousHomeworkResults({
      weeklySessionId: week2!.id,
      statuses: studentMembershipIds.map((id) => ({ groupMembershipId: id, status: 'done' as const })),
      actor,
    });

    const missingAfter = await getMissingRequirements(week2!.id);
    expect(missingAfter.map((m) => m.code)).not.toContain('previous_homework_results');

    const workLog = await approveWeeklySession({ weeklySessionId: week2!.id, actor });
    expect(workLog.completedAt).not.toBeNull();
  });
});
