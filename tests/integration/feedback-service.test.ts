import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  getMentorAggregateFeedback,
  getPendingFeedbackCycleForStudent,
  listContinuousFeedbackForViewer,
  submitContinuousFeedback,
  submitFeedbackResponse,
} from '@/server/services/feedback-service';
import { createChapter } from '@/server/services/chapter-service';
import { addGroupMember, assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { approveWeeklySession, finalizeAttendance, setHomeworkDecision, updateWorkLogNarrative } from '@/server/services/weekly-work-service';
import { getDb } from '@/server/db';
import { feedbackCycles, groupMemberships } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let groupAId: string;
let mentorAId: string;
let studentAId: string;
let studentMembershipId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core programs missing.');
  onlineProgramId = online.id;

  const year = await createAcademicYear({ label: '2026–2027', startDate: '2026-09-01', endDate: '2027-06-30', activate: true, actor });
  academicYearId = year.id;

  const chapterA = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;
  const groupA = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'bio', actor });
  groupAId = groupA.id;

  const mentorA = await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
  mentorAId = mentorA.userId;
  await assignGroupMentor({ groupId: groupAId, mentorUserId: mentorAId, actor });

  const studentA = await createUser({ username: 'student.a', fullName: 'Student A', role: 'student', chapterId: chapterAId, academicYearId, actor });
  studentAId = studentA.userId;
  const membership = await addGroupMember({ groupId: groupAId, userId: studentAId, role: 'student', actor });
  studentMembershipId = membership.id;

  await updateProgramSchedule({ programId: onlineProgramId, weeklyDayOfWeek: 6, weeklyStartMinute: 18 * 60, weeklyDurationMinutes: 60, actor });
});

afterAll(async () => {
  await closeTestDb();
});

async function completeSession(sessionId: string) {
  await finalizeAttendance({ weeklySessionId: sessionId, records: [{ groupMembershipId: studentMembershipId, status: 'present' }], actor });
  await updateWorkLogNarrative({ weeklySessionId: sessionId, whatWeDid: 'x', nextWeekGoal: 'y', projectHealth: 'on_track', actor });
  await setHomeworkDecision({ weeklySessionId: sessionId, noHomework: true, actor });
  await approveWeeklySession({ weeklySessionId: sessionId, actor });
}

describe('continuous feedback', () => {
  it('lets a Student submit feedback and a Chapter Head of their own chapter read it', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitContinuousFeedback({ scope: studentScope, category: 'mentor', message: 'Harika bir mentor.', isAnonymous: false, actor });

    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const headScope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const items = await listContinuousFeedbackForViewer(headScope);
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toBe('Harika bir mentor.');
  });

  it('never lets a Chapter Head of a different chapter see it', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitContinuousFeedback({ scope: studentScope, category: 'mentor', message: 'x', isAnonymous: false, actor });

    const headB = await createUser({ username: 'head.b', fullName: 'Head B', role: 'chapter_head', chapterId: chapterBId, academicYearId, actor });
    const headBScope = await loadAccessScope(headB.userId, 'chapter_head', academicYearId);
    expect(await listContinuousFeedbackForViewer(headBScope)).toHaveLength(0);
  });

  it('stores no reporter reference for anonymous feedback', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitContinuousFeedback({ scope: studentScope, category: 'platform', message: 'anon', isAnonymous: true, actor });

    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const headScope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const [item] = await listContinuousFeedbackForViewer(headScope);
    expect(item?.isAnonymous).toBe(true);
    expect(item?.reporterUserId).toBeNull();
  });

  it('rejects submission from a non-Student role', async () => {
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      submitContinuousFeedback({ scope: mentorScope, category: 'mentor', message: 'x', isAnonymous: false, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('maybeGenerateFeedbackCycles — triggered from approveWeeklySession', () => {
  it('creates a cycle for every active student membership exactly every 3 completed sessions, idempotently', async () => {
    await generateWeeklySessionsForGroup(groupAId);
    const sessions = await listWeeklySessionsByGroup(groupAId);
    expect(sessions.length).toBeGreaterThanOrEqual(6);

    await completeSession(sessions[0]!.id);
    let cycles = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    expect(cycles).toHaveLength(0);

    await completeSession(sessions[1]!.id);
    cycles = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    expect(cycles).toHaveLength(0);

    await completeSession(sessions[2]!.id);
    cycles = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.completedSessionThreshold).toBe(3);

    await completeSession(sessions[3]!.id);
    await completeSession(sessions[4]!.id);
    cycles = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    expect(cycles).toHaveLength(1); // still just the one from threshold 3

    await completeSession(sessions[5]!.id);
    cycles = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    expect(cycles).toHaveLength(2);
    expect(cycles.map((c) => c.completedSessionThreshold).sort()).toEqual([3, 6]);
  });

  it('never generates a cycle for an inactive (removed) student membership', async () => {
    const studentB = await createUser({ username: 'student.b', fullName: 'Student B', role: 'student', chapterId: chapterAId, academicYearId, actor });
    const membershipB = await addGroupMember({ groupId: groupAId, userId: studentB.userId, role: 'student', actor });
    await getDb().update(groupMemberships).set({ isActive: false }).where(eq(groupMemberships.id, membershipB.id));

    await generateWeeklySessionsForGroup(groupAId);
    const sessions = await listWeeklySessionsByGroup(groupAId);
    for (const s of sessions.slice(0, 3)) await completeSession(s.id);

    const cyclesForB = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, membershipB.id));
    expect(cyclesForB).toHaveLength(0);
  });
});

describe('feedback cycle response', () => {
  async function triggerFirstCycle() {
    await generateWeeklySessionsForGroup(groupAId);
    const sessions = await listWeeklySessionsByGroup(groupAId);
    for (const s of sessions.slice(0, 3)) await completeSession(s.id);
    const [cycle] = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    if (!cycle) throw new Error('No cycle.');
    return cycle;
  }

  it('surfaces the pending cycle to the owning Student and clears it after a response', async () => {
    await triggerFirstCycle();
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const pending = await getPendingFeedbackCycleForStudent(studentScope);
    expect(pending).not.toBeNull();

    await submitFeedbackResponse({
      cycleId: pending!.id,
      ratingMentorGuidance: 5,
      ratingSessionProductivity: 4,
      ratingSupport: 5,
      ratingGroupProgress: 4,
      scope: studentScope,
      actor: { id: studentAId, name: 'Student A' },
    });

    expect(await getPendingFeedbackCycleForStudent(studentScope)).toBeNull();
  });

  it('rejects a different Student responding to someone else’s cycle', async () => {
    const cycle = await triggerFirstCycle();
    const studentB = await createUser({ username: 'student.b', fullName: 'Student B', role: 'student', chapterId: chapterAId, academicYearId, actor });
    await addGroupMember({ groupId: groupAId, userId: studentB.userId, role: 'student', actor });
    const studentBScope = await loadAccessScope(studentB.userId, 'student', academicYearId);

    await expect(
      submitFeedbackResponse({
        cycleId: cycle.id,
        ratingMentorGuidance: 5,
        ratingSessionProductivity: 5,
        ratingSupport: 5,
        ratingGroupProgress: 5,
        scope: studentBScope,
        actor: { id: studentB.userId, name: 'Student B' },
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a rating outside 1-5', async () => {
    const cycle = await triggerFirstCycle();
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await expect(
      submitFeedbackResponse({
        cycleId: cycle.id,
        ratingMentorGuidance: 7,
        ratingSessionProductivity: 4,
        ratingSupport: 4,
        ratingGroupProgress: 4,
        scope: studentScope,
        actor: { id: studentAId, name: 'Student A' },
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('getMentorAggregateFeedback', () => {
  it('gives the Group’s own Mentor averages only, never raw responses', async () => {
    await generateWeeklySessionsForGroup(groupAId);
    const sessions = await listWeeklySessionsByGroup(groupAId);
    for (const s of sessions.slice(0, 3)) await completeSession(s.id);
    const [cycle] = await getDb().select().from(feedbackCycles).where(eq(feedbackCycles.groupMembershipId, studentMembershipId));
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitFeedbackResponse({
      cycleId: cycle!.id,
      ratingMentorGuidance: 5,
      ratingSessionProductivity: 3,
      ratingSupport: 4,
      ratingGroupProgress: 2,
      mostUseful: 'raw text that must never leak to the Mentor',
      scope: studentScope,
      actor: { id: studentAId, name: 'Student A' },
    });

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const averages = await getMentorAggregateFeedback(mentorScope, groupAId);
    expect(averages?.responseCount).toBe(1);
    expect(averages?.avgMentorGuidance).toBe(5);
    expect(averages?.avgGroupProgress).toBe(2);
    expect(averages).not.toHaveProperty('mostUseful');
  });

  it('returns null for a Mentor requesting a Group they do not mentor', async () => {
    const otherMentor = await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: chapterBId, academicYearId, actor });
    const otherMentorScope = await loadAccessScope(otherMentor.userId, 'mentor', academicYearId);
    expect(await getMentorAggregateFeedback(otherMentorScope, groupAId)).toBeNull();
  });
});
