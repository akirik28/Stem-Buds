import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { managementAlerts, notifications, weeklySessions, weeklyWorkLogs, groupMemberships } from '@/server/db/schema';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup, addGroupMember } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { finalizeAttendance, updateWorkLogNarrative, setHomeworkDecision, approveWeeklySession } from '@/server/services/weekly-work-service';
import { createProject, addMilestone } from '@/server/services/project-service';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Deterministic alert engine — DB-backed behavior. Groq/AI has zero
 * involvement anywhere in this file; only application code decides whether
 * an alert exists.
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let bilsemProgramId: string;
let academicYearId: string;
let chapterId: string;
let groupId: string;
let mentorId: string;

async function activeAlerts(groupId: string) {
  return getDb()
    .select()
    .from(managementAlerts)
    .where(and(eq(managementAlerts.groupId, groupId), inArray(managementAlerts.status, ['new', 'investigating'])));
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
  if (!online || !bilsem) throw new Error('Core programs missing.');
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

  const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  chapterId = chapter.id;
  const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
  groupId = group.id;

  const mentor = await createUser({
    username: 'mentor.a',
    fullName: 'Mentor A',
    role: 'mentor',
    chapterId,
    academicYearId,
    actor,
  });
  mentorId = mentor.userId;
  await assignGroupMentor({ groupId, mentorUserId: mentorId, actor });

  await updateProgramSchedule({
    programId: onlineProgramId,
    weeklyDayOfWeek: 6,
    weeklyStartMinute: 18 * 60,
    weeklyDurationMinutes: 60,
    actor,
  });
});

afterAll(async () => {
  await closeTestDb();
});

/** Backdates a session's schedule so it reads as already in the past. */
async function backdateSession(sessionId: string, hoursAgo: number) {
  const start = new Date(Date.now() - hoursAgo * 60 * 60 * 1000 - 60 * 60 * 1000);
  const end = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  await getDb().update(weeklySessions).set({ scheduledStartAt: start, scheduledEndAt: end }).where(eq(weeklySessions.id, sessionId));
}

async function backdateCompletion(sessionId: string, daysAgo: number) {
  const completedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await getDb().update(weeklyWorkLogs).set({ completedAt }).where(eq(weeklyWorkLogs.weeklySessionId, sessionId));
}

describe('MISSING_WEEKLY_RECORD', () => {
  it('fires only once a scheduled session is more than 24h overdue with no completion', async () => {
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');

    await backdateSession(session1.id, 10); // ended 10h ago — not yet overdue
    await runAlertEvaluation({ force: true });
    expect(await activeAlerts(groupId)).toHaveLength(0);

    await backdateSession(session1.id, 30); // ended 30h ago — overdue now
    await runAlertEvaluation({ force: true });
    const alerts = await activeAlerts(groupId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ category: 'missing_weekly_record', severity: 'red' });
  });

  it('is idempotent and resolves once the record is completed', async () => {
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');
    await backdateSession(session1.id, 30);

    await runAlertEvaluation({ force: true });
    await runAlertEvaluation({ force: true });
    const afterTwoRuns = await activeAlerts(groupId);
    expect(afterTwoRuns).toHaveLength(1); // no duplicate

    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({
      weeklySessionId: session1.id,
      whatWeDid: 'x',
      nextWeekGoal: 'y',
      projectHealth: 'on_track',
      actor,
    });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });

    await runAlertEvaluation({ force: true });
    expect(await activeAlerts(groupId)).toHaveLength(0);

    const resolved = await getDb()
      .select()
      .from(managementAlerts)
      .where(and(eq(managementAlerts.groupId, groupId), eq(managementAlerts.category, 'missing_weekly_record')));
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.status).toBe('resolved'); // history preserved, not deleted
  });
});

describe('ATTENDANCE_RISK', () => {
  it('fires red below 65% attendance for the latest finalized session', async () => {
    for (let i = 0; i < 10; i++) {
      const student = await createUser({
        username: `student.${i}`,
        fullName: `Student ${i}`,
        role: 'student',
        chapterId,
        academicYearId,
        actor,
      });
      await addGroupMember({ groupId, userId: student.userId, role: 'student', actor });
    }
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');

    const members = await getDb().select().from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
    const records = members.map((m, i) => ({ groupMembershipId: m.id, status: i < 4 ? ('present' as const) : ('absent' as const) }));
    await finalizeAttendance({ weeklySessionId: session1.id, records, actor });

    await runAlertEvaluation({ force: true });
    const alerts = await activeAlerts(groupId);
    const rateAlert = alerts.find((a) => (a.metadata as { sessionId?: string })?.sessionId === session1.id);
    expect(rateAlert).toMatchObject({ category: 'attendance_risk', severity: 'red' });
  });

  it('flags a student with two consecutive unexcused absences', async () => {
    const student = await createUser({
      username: 'student.streak',
      fullName: 'Student Streak',
      role: 'student',
      chapterId,
      academicYearId,
      actor,
    });
    await addGroupMember({ groupId, userId: student.userId, role: 'student', actor });
    await generateWeeklySessionsForGroup(groupId);
    const sessions = await listWeeklySessionsByGroup(groupId);
    const [s1, s2] = sessions;
    if (!s1 || !s2) throw new Error('Not enough sessions.');
    const [membership] = await getDb()
      .select()
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.role, 'student')));
    if (!membership) throw new Error('No membership.');

    await finalizeAttendance({ weeklySessionId: s1.id, records: [{ groupMembershipId: membership.id, status: 'absent' }], actor });
    await finalizeAttendance({ weeklySessionId: s2.id, records: [{ groupMembershipId: membership.id, status: 'absent' }], actor });

    await runAlertEvaluation({ force: true });
    const alerts = await activeAlerts(groupId);
    const streakAlert = alerts.find((a) => (a.metadata as { groupMembershipId?: string })?.groupMembershipId === membership.id);
    expect(streakAlert).toMatchObject({ category: 'attendance_risk', severity: 'yellow' });
  });
});

describe('PROJECT_BLOCKED', () => {
  it('fires red for a delayed project-health reading and clears once healthy', async () => {
    await createProject({ groupId, academicYearId, name: 'Proje', actor });
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');
    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({
      weeklySessionId: session1.id,
      whatWeDid: 'x',
      nextWeekGoal: 'y',
      projectHealth: 'delayed',
      actor,
    });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });

    await runAlertEvaluation({ force: true });
    let alerts = await activeAlerts(groupId);
    expect(alerts.some((a) => a.category === 'project_blocked' && a.severity === 'red')).toBe(true);

    const sessions = await listWeeklySessionsByGroup(groupId);
    const s2 = sessions[1];
    if (!s2) throw new Error('No second session.');
    await finalizeAttendance({ weeklySessionId: s2.id, records: [], actor });
    await updateWorkLogNarrative({ weeklySessionId: s2.id, whatWeDid: 'x', nextWeekGoal: 'y', projectHealth: 'on_track', actor });
    await setHomeworkDecision({ weeklySessionId: s2.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: s2.id, actor });

    await runAlertEvaluation({ force: true });
    alerts = await activeAlerts(groupId);
    expect(alerts.some((a) => a.category === 'project_blocked')).toBe(false);
  });

  it('surfaces a reported blocker as its own alert', async () => {
    await createProject({ groupId, academicYearId, name: 'Proje', actor });
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');
    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({
      weeklySessionId: session1.id,
      whatWeDid: 'x',
      problems: 'Yeterli veri elde edilemiyor.',
      nextWeekGoal: 'y',
      projectHealth: 'on_track',
      actor,
    });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });

    await runAlertEvaluation({ force: true });
    const alerts = await activeAlerts(groupId);
    const blockerAlert = alerts.find((a) => a.category === 'project_blocked' && a.detail.includes('Yeterli veri'));
    expect(blockerAlert).toBeDefined();
  });
});

describe('MILESTONE_OR_TASK_OVERDUE', () => {
  it('fires for a past-due, uncompleted milestone and never for a completed one', async () => {
    const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
    await addMilestone({ projectId: project.id, title: 'Gecikmiş', dueDate: '2020-01-01', actor });
    const onTime = await addMilestone({ projectId: project.id, title: 'Tamamlanan', dueDate: '2020-01-01', actor });
    const { updateMilestoneStatus } = await import('@/server/services/project-service');
    await updateMilestoneStatus({ milestoneId: onTime.id, status: 'completed', actor });

    await runAlertEvaluation({ force: true });
    const alerts = await activeAlerts(groupId);
    const overdue = alerts.filter((a) => a.category === 'milestone_overdue');
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.detail).toContain('Gecikmiş');
  });
});

describe('PROJECT_STALE — the exact 7/14-day escalation ladder', () => {
  async function setupStaleProject() {
    const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');
    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({ weeklySessionId: session1.id, whatWeDid: 'x', nextWeekGoal: 'y', projectHealth: 'on_track', actor });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });
    return { project, session1 };
  }

  it('is silent before 7 full days', async () => {
    const { session1 } = await setupStaleProject();
    await backdateCompletion(session1.id, 6);
    await runAlertEvaluation({ force: true });
    expect((await activeAlerts(groupId)).filter((a) => a.category === 'project_stale')).toHaveLength(0);
  });

  it('at 7 days: notifies the Mentor and Chapter Head only, not Executive Management', async () => {
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor });
    const director = await createUser({ username: 'director.a', fullName: 'Director A', role: 'regional_director', actor });

    const { session1 } = await setupStaleProject();
    await backdateCompletion(session1.id, 7);
    await runAlertEvaluation({ force: true });

    const alert = (await activeAlerts(groupId)).find((a) => a.category === 'project_stale');
    expect(alert).toMatchObject({ severity: 'yellow' });
    expect((alert?.metadata as { stage?: number })?.stage).toBe(7);

    const mentorNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, mentorId));
    const headNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, head.userId));
    const directorNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, director.userId));
    expect(mentorNotifs.length).toBeGreaterThan(0);
    expect(headNotifs.length).toBeGreaterThan(0);
    expect(directorNotifs).toHaveLength(0); // not notified at day 7
  });

  it('days 7–13: repeated evaluation does not re-notify or duplicate the alert', async () => {
    const { session1 } = await setupStaleProject();
    await backdateCompletion(session1.id, 7);
    await runAlertEvaluation({ force: true });
    await backdateCompletion(session1.id, 10);
    await runAlertEvaluation({ force: true });
    await backdateCompletion(session1.id, 12);
    await runAlertEvaluation({ force: true });

    const alerts = (await activeAlerts(groupId)).filter((a) => a.category === 'project_stale');
    expect(alerts).toHaveLength(1); // same episode, not duplicated
    const mentorNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, mentorId));
    expect(mentorNotifs).toHaveLength(1); // notified once, not on every re-evaluation
  });

  it('at 14 days: escalates the same episode to Regional/Vice Director, keeps it visible to Mentor + Chapter Head', async () => {
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor });
    const director = await createUser({ username: 'director.a', fullName: 'Director A', role: 'regional_director', actor });

    const { session1 } = await setupStaleProject();
    await backdateCompletion(session1.id, 7);
    await runAlertEvaluation({ force: true });
    await backdateCompletion(session1.id, 14);
    await runAlertEvaluation({ force: true });

    const alerts = (await activeAlerts(groupId)).filter((a) => a.category === 'project_stale');
    expect(alerts).toHaveLength(1); // escalation of the same episode, not a second alert
    expect(alerts[0]).toMatchObject({ severity: 'red' });
    expect((alerts[0]?.metadata as { stage?: number })?.stage).toBe(14);

    const directorNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, director.userId));
    expect(directorNotifs.length).toBeGreaterThan(0); // now notified

    const mentorNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, mentorId));
    const headNotifs = await getDb().select().from(notifications).where(eq(notifications.userId, head.userId));
    expect(mentorNotifs.length).toBeGreaterThan(0); // still visible/notified overall
    expect(headNotifs.length).toBeGreaterThan(0);

    // Re-running at day 14 again must not re-notify Executive Management a second time.
    await runAlertEvaluation({ force: true });
    const directorNotifsAfter = await getDb().select().from(notifications).where(eq(notifications.userId, director.userId));
    expect(directorNotifsAfter).toHaveLength(directorNotifs.length);
  });

  it('resolves automatically once a genuine new progress update is recorded, then represents legitimate recurrence as new history', async () => {
    const { session1 } = await setupStaleProject();
    await backdateCompletion(session1.id, 7);
    await runAlertEvaluation({ force: true });
    expect((await activeAlerts(groupId)).filter((a) => a.category === 'project_stale')).toHaveLength(1);

    const sessions = await listWeeklySessionsByGroup(groupId);
    const s2 = sessions[1];
    if (!s2) throw new Error('No second session.');
    await finalizeAttendance({ weeklySessionId: s2.id, records: [], actor });
    await updateWorkLogNarrative({ weeklySessionId: s2.id, whatWeDid: 'x', nextWeekGoal: 'y', projectHealth: 'on_track', actor });
    await setHomeworkDecision({ weeklySessionId: s2.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: s2.id, actor });

    await runAlertEvaluation({ force: true });
    expect((await activeAlerts(groupId)).filter((a) => a.category === 'project_stale')).toHaveLength(0);

    // Legitimate recurrence: stale again after the new progress update.
    await backdateCompletion(s2.id, 8);
    await runAlertEvaluation({ force: true });
    const recurrence = (await activeAlerts(groupId)).filter((a) => a.category === 'project_stale');
    expect(recurrence).toHaveLength(1);

    const history = await getDb()
      .select()
      .from(managementAlerts)
      .where(and(eq(managementAlerts.groupId, groupId), eq(managementAlerts.category, 'project_stale')));
    expect(history.length).toBeGreaterThanOrEqual(2); // first (resolved) episode preserved + the new one
    expect(history.some((h) => h.status === 'resolved')).toBe(true);
  });

  it('excludes a finally-delivered project from staleness evaluation', async () => {
    const { project, session1 } = await setupStaleProject();
    await backdateCompletion(session1.id, 20);
    const { updateProjectOutcome } = await import('@/server/services/project-service');
    await updateProjectOutcome({ projectId: project.id, finalDelivered: true, actor });

    await runAlertEvaluation({ force: true });
    expect((await activeAlerts(groupId)).filter((a) => a.category === 'project_stale')).toHaveLength(0);
  });

  it('uses the project start date as the baseline when no progress was ever recorded', async () => {
    const oldStart = new Date();
    oldStart.setDate(oldStart.getDate() - 20);
    const startDateStr = oldStart.toISOString().slice(0, 10);
    await createProject({ groupId, academicYearId, name: 'Proje', startDate: startDateStr, actor });

    await runAlertEvaluation({ force: true });
    const alert = (await activeAlerts(groupId)).find((a) => a.category === 'project_stale');
    expect(alert).toMatchObject({ severity: 'red' });
  });
});

describe('idempotency / retry-safety', () => {
  it('running evaluation twice never duplicates alerts', async () => {
    await generateWeeklySessionsForGroup(groupId);
    const [session1] = await listWeeklySessionsByGroup(groupId);
    if (!session1) throw new Error('No session.');
    await backdateSession(session1.id, 30);

    await runAlertEvaluation({ force: true });
    const first = await activeAlerts(groupId);
    await runAlertEvaluation({ force: true });
    const second = await activeAlerts(groupId);
    expect(second).toHaveLength(first.length);
  });

  it('throttles back-to-back non-forced runs', async () => {
    const first = await runAlertEvaluation();
    const second = await runAlertEvaluation();
    expect(first.throttled).toBe(false);
    expect(second.throttled).toBe(true);
  });
});

describe('program isolation', () => {
  it('never tags an alert with a programId that disagrees with its own chapter/group', async () => {
    const bilsemChapter = await createChapter({ programId: bilsemProgramId, code: 'BLS1', name: 'BİLSEM Ankara', actor });
    const bilsemGroup = await createGroup({ chapterId: bilsemChapter.id, academicYearId, disciplineKey: 'cs', actor });
    await updateProgramSchedule({
      programId: bilsemProgramId,
      weeklyDayOfWeek: 6,
      weeklyStartMinute: 10 * 60,
      weeklyDurationMinutes: 90,
      actor,
    });
    await generateWeeklySessionsForGroup(bilsemGroup.id);
    const [session1] = await listWeeklySessionsByGroup(bilsemGroup.id);
    if (!session1) throw new Error('No session.');
    await backdateSession(session1.id, 30);

    await runAlertEvaluation({ force: true });
    const alerts = await activeAlerts(bilsemGroup.id);
    expect(alerts.every((a) => a.programId === bilsemProgramId)).toBe(true);
    expect(alerts.every((a) => a.programId !== onlineProgramId)).toBe(true);
  });
});
