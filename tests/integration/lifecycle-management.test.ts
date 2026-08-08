import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { auditLogs, users } from '@/server/db/schema';
import {
  archiveChapter,
  createChapter,
  deleteChapter,
  getChapterById,
  reactivateChapter,
} from '@/server/services/chapter-service';
import {
  archiveGroup,
  assignGroupMentor,
  createGroup,
  addGroupMember,
  deleteGroup,
  getGroupById,
  reactivateGroup,
} from '@/server/services/group-service';
import { createUser, deleteUser, getUserById } from '@/server/services/user-admin';
import { createAcademicYear, deleteAcademicYear, getAcademicYearById } from '@/server/services/academic-year';
import {
  cancelWeeklySession,
  deleteWeeklySession,
  generateWeeklySessionsForGroup,
  getWeeklySessionById,
  listWeeklySessionsByGroup,
} from '@/server/services/weekly-session-service';
import { finalizeAttendance } from '@/server/services/weekly-work-service';
import { updateProgramSchedule, getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Safe delete/archive across every entity that had no lifecycle path before
 * this audit: Chapters, Groups, Users, Academic Years. The rule throughout:
 * hard-delete only when there is genuinely nothing to lose (proven by an
 * explicit application-level check, not just "the FK happened not to
 * fire"), archive/deactivate otherwise — history is never silently
 * destroyed.
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;

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
});

afterAll(async () => {
  await closeTestDb();
});

describe('chapter lifecycle', () => {
  it('archives and reactivates without touching anything else', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const archived = await archiveChapter({ id: chapter.id, actor });
    expect(archived.isActive).toBe(false);

    const reactivated = await reactivateChapter({ id: chapter.id, actor });
    expect(reactivated.isActive).toBe(true);
  });

  it('hard-deletes an empty chapter, and records it in the audit log', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    await deleteChapter({ id: chapter.id, actor });
    expect(await getChapterById(chapter.id)).toBeNull();

    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.action, 'chapter.deleted'));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.targetId).toBe(chapter.id);
  });

  it('refuses to delete a chapter that has a group', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });

    await expect(deleteChapter({ id: chapter.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
    expect(await getChapterById(chapter.id)).not.toBeNull();
  });

  it('refuses to delete a chapter that has a member, even with zero groups', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    await createUser({
      username: 'mentor.only',
      fullName: 'Mentor Only',
      role: 'mentor',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });

    await expect(deleteChapter({ id: chapter.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });
});

describe('group lifecycle', () => {
  it('archives and reactivates without touching anything else', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });

    const archived = await archiveGroup({ id: group.id, actor });
    expect(archived.isActive).toBe(false);
    const reactivated = await reactivateGroup({ id: group.id, actor });
    expect(reactivated.isActive).toBe(true);
  });

  it('hard-deletes an empty group', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });

    await deleteGroup({ id: group.id, actor });
    expect(await getGroupById(group.id)).toBeNull();
  });

  it('refuses to delete a group that has a member', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    const student = await createUser({
      username: 'student.only',
      fullName: 'Student Only',
      role: 'student',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });
    await addGroupMember({ groupId: group.id, userId: student.userId, role: 'student', actor });

    await expect(deleteGroup({ id: group.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
    expect(await getGroupById(group.id)).not.toBeNull();
  });

  it('refuses to delete a group that has weekly sessions generated', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(group.id);

    await expect(deleteGroup({ id: group.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });
});

describe('user deletion — only a genuinely unused account', () => {
  it('hard-deletes a never-logged-in user with no membership history', async () => {
    const user = await createUser({ username: 'test.unused', fullName: 'Test Unused', role: 'vice_president', actor });
    await deleteUser({ targetUserId: user.userId, actor });
    expect(await getUserById(user.userId)).toBeNull();
  });

  it('refuses to delete a user who has ever logged in', async () => {
    const user = await createUser({ username: 'test.loggedin', fullName: 'Test Loggedin', role: 'vice_president', actor });
    await getDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.userId));

    await expect(deleteUser({ targetUserId: user.userId, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
    expect(await getUserById(user.userId)).not.toBeNull();
  });

  it('refuses to delete a user with chapter membership history', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const mentor = await createUser({
      username: 'mentor.history',
      fullName: 'Mentor History',
      role: 'mentor',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });

    await expect(deleteUser({ targetUserId: mentor.userId, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });

  it('refuses to delete a user who is assigned as a group’s mentor', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createUser({
      username: 'mentor.assigned',
      fullName: 'Mentor Assigned',
      role: 'mentor',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });
    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });

    await expect(deleteUser({ targetUserId: mentor.userId, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });

  it('refuses to let an account delete itself', async () => {
    const user = await createUser({ username: 'self.test', fullName: 'Self Test', role: 'vice_president', actor });
    await expect(
      deleteUser({ targetUserId: user.userId, actor: { id: user.userId, name: 'Self Test' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('academic year deletion', () => {
  it('refuses to delete the active year', async () => {
    await expect(deleteAcademicYear({ id: academicYearId, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });

  it('deletes an inactive, never-used year', async () => {
    const unusedYear = await createAcademicYear({
      label: '2027–2028',
      startDate: '2027-09-01',
      endDate: '2028-06-30',
      activate: false,
      actor,
    });
    await deleteAcademicYear({ id: unusedYear.id, actor });
    expect(await getAcademicYearById(unusedYear.id)).toBeNull();
  });

  it('refuses to delete an inactive year that has real history', async () => {
    const usedYear = await createAcademicYear({
      label: '2025–2026',
      startDate: '2025-09-01',
      endDate: '2026-06-30',
      activate: false,
      actor,
    });
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    await createGroup({ chapterId: chapter.id, academicYearId: usedYear.id, disciplineKey: 'bio', actor });

    await expect(deleteAcademicYear({ id: usedYear.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
    expect(await getAcademicYearById(usedYear.id)).not.toBeNull();
  });
});

describe('weekly session lifecycle', () => {
  it('hard-deletes a never-touched future session', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(group.id);
    const [session1] = await listWeeklySessionsByGroup(group.id);
    if (!session1) throw new Error('No session generated.');

    await deleteWeeklySession({ weeklySessionId: session1.id, actor });
    expect(await getWeeklySessionById(session1.id)).toBeNull();
  });

  it('still allows deletion after the session page has merely been viewed — a real bug once, fixed here', async () => {
    // `getMissingRequirements` is called on every page render and lazily
    // creates an empty `weekly_work_logs` row via `getOrCreateWorkLog` — that
    // used to make `deleteWeeklySession` see "a row exists" and refuse to
    // delete literally every session anyone had ever opened, which is every
    // session with a visible "Sil" button in the first place. The check must
    // key on actual content, not row existence.
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(group.id);
    const [session1] = await listWeeklySessionsByGroup(group.id);
    if (!session1) throw new Error('No session generated.');

    const { getMissingRequirements } = await import('@/server/services/weekly-work-service');
    await getMissingRequirements(session1.id);
    const { getDb: getDbFn } = await import('@/server/db');
    const { weeklyWorkLogs } = await import('@/server/db/schema');
    const rows = await getDbFn().select().from(weeklyWorkLogs).where(eq(weeklyWorkLogs.weeklySessionId, session1.id));
    expect(rows).toHaveLength(1); // the lazy row really does exist now

    await deleteWeeklySession({ weeklySessionId: session1.id, actor });
    expect(await getWeeklySessionById(session1.id)).toBeNull();
  });

  it('refuses to hard-delete a session that already has a work log row, offering cancel instead', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(group.id);
    const [session1] = await listWeeklySessionsByGroup(group.id);
    if (!session1) throw new Error('No session generated.');

    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });

    await expect(deleteWeeklySession({ weeklySessionId: session1.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );

    const cancelled = await cancelWeeklySession({ weeklySessionId: session1.id, actor });
    expect(cancelled.state).toBe('cancelled');
    // The attendance row entered before cancelling is still there — cancel
    // preserves the row, it does not clear it.
    expect(await getWeeklySessionById(session1.id)).not.toBeNull();
  });

  it('never lets a completed session be cancelled or deleted', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    await updateProgramSchedule({
      programId: onlineProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 18 * 60,
      weeklyDurationMinutes: 60,
      actor,
    });
    await generateWeeklySessionsForGroup(group.id);
    const [session1] = await listWeeklySessionsByGroup(group.id);
    if (!session1) throw new Error('No session generated.');

    const { updateWorkLogNarrative, setHomeworkDecision, approveWeeklySession } = await import(
      '@/server/services/weekly-work-service'
    );
    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({
      weeklySessionId: session1.id,
      whatWeDid: 'Konu belirlendi',
      nextWeekGoal: 'Kaynak taraması',
      projectHealth: 'on_track',
      actor,
    });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });

    await expect(deleteWeeklySession({ weeklySessionId: session1.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
    await expect(cancelWeeklySession({ weeklySessionId: session1.id, actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });
});
