import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import { listAlertsForViewer, listAlertsForMentor, setAlertWorkflowStatus, getManagementKpis } from '@/server/services/alert-query';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { createProject } from '@/server/services/project-service';
import { getDb } from '@/server/db';
import { weeklySessions, weeklyWorkLogs } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let bilsemProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let groupAId: string;
let groupBId: string;
let mentorAId: string;

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

  const chapterA = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;
  const groupA = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'bio', actor });
  const groupB = await createGroup({ chapterId: chapterBId, academicYearId, disciplineKey: 'cs', actor });
  groupAId = groupA.id;
  groupBId = groupB.id;

  const mentorA = await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
  mentorAId = mentorA.userId;
  await assignGroupMentor({ groupId: groupAId, mentorUserId: mentorAId, actor });

  await updateProgramSchedule({ programId: onlineProgramId, weeklyDayOfWeek: 6, weeklyStartMinute: 18 * 60, weeklyDurationMinutes: 60, actor });
});

afterAll(async () => {
  await closeTestDb();
});

async function makeMissingRecordAlertInGroup(groupId: string) {
  await generateWeeklySessionsForGroup(groupId);
  const [session1] = await listWeeklySessionsByGroup(groupId);
  if (!session1) throw new Error('No session.');
  const start = new Date(Date.now() - 40 * 60 * 60 * 1000);
  const end = new Date(Date.now() - 39 * 60 * 60 * 1000);
  await getDb().update(weeklySessions).set({ scheduledStartAt: start, scheduledEndAt: end }).where(eq(weeklySessions.id, session1.id));
  await runAlertEvaluation({ force: true });
  return session1;
}

describe('listAlertsForViewer — scoping', () => {
  it('lets Chapter Head see only their own chapter’s alerts', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    await makeMissingRecordAlertInGroup(groupBId);

    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const scope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const alerts = await listAlertsForViewer(scope);

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((a) => a.chapterId === chapterAId)).toBe(true);
  });

  it('lets a Mentor see nothing through the executive/chapter-head feed even for their own group', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    const scope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await listAlertsForViewer(scope)).toHaveLength(0);
    // Their own dedicated compact surface does see it.
    expect((await listAlertsForMentor(scope)).length).toBeGreaterThan(0);
  });

  it('never lets a Mentor’s compact surface include an unrelated Group', async () => {
    await makeMissingRecordAlertInGroup(groupBId); // not mentorA's group
    const scope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await listAlertsForMentor(scope)).toHaveLength(0);
  });

  it('gives Executives everything across chapters, respecting the Program filter', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const all = await listAlertsForViewer(scope);
    expect(all.length).toBeGreaterThan(0);

    const filtered = await listAlertsForViewer(scope, { programId: bilsemProgramId });
    expect(filtered).toHaveLength(0); // no BİLSEM data was created
  });

  it('hides an early-stage (7-day) PROJECT_STALE alert from the default Executive feed, but Chapter Head still sees it', async () => {
    await createProject({ groupId: groupAId, academicYearId, name: 'Proje', actor });
    await generateWeeklySessionsForGroup(groupAId);
    const [session1] = await listWeeklySessionsByGroup(groupAId);
    if (!session1) throw new Error('No session.');
    const { finalizeAttendance, updateWorkLogNarrative, setHomeworkDecision, approveWeeklySession } = await import(
      '@/server/services/weekly-work-service'
    );
    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({ weeklySessionId: session1.id, whatWeDid: 'x', nextWeekGoal: 'y', projectHealth: 'on_track', actor });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });
    await getDb()
      .update(weeklyWorkLogs)
      .set({ completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) })
      .where(eq(weeklyWorkLogs.weeklySessionId, session1.id));
    await runAlertEvaluation({ force: true });

    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const execAlerts = await listAlertsForViewer(execScope);
    expect(execAlerts.some((a) => a.category === 'project_stale')).toBe(false);

    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const headScope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const headAlerts = await listAlertsForViewer(headScope);
    expect(headAlerts.some((a) => a.category === 'project_stale')).toBe(true);
  });
});

describe('setAlertWorkflowStatus', () => {
  it('lets an authorized Chapter Head mark their own chapter’s alert as İnceleniyor, audited', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const scope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const [alert] = await listAlertsForViewer(scope);
    if (!alert) throw new Error('No alert.');

    const updated = await setAlertWorkflowStatus({
      alertId: alert.id,
      status: 'investigating',
      scope,
      actor: { id: head.userId, name: 'Head A' },
    });
    expect(updated.status).toBe('investigating');

    const { getDb: getDbFn } = await import('@/server/db');
    const { auditLogs } = await import('@/server/db/schema');
    const logs = await getDbFn().select().from(auditLogs).where(eq(auditLogs.action, 'management_alert.status_changed'));
    expect(logs.length).toBeGreaterThan(0);
  });

  it('rejects a Chapter Head acting on another chapter’s alert, even with the real ID', async () => {
    await makeMissingRecordAlertInGroup(groupBId);
    const headA = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const scopeA = await loadAccessScope(headA.userId, 'chapter_head', academicYearId);

    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const [bAlert] = await listAlertsForViewer(execScope, { chapterId: chapterBId });
    if (!bAlert) throw new Error('No alert.');

    await expect(
      setAlertWorkflowStatus({ alertId: bAlert.id, status: 'investigating', scope: scopeA, actor: { id: headA.userId, name: 'Head A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets a Mentor mark their own Group’s alert as İnceleniyor — they are the engine’s Sorumlu', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    const scope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const [alert] = await listAlertsForMentor(scope);
    if (!alert) throw new Error('No alert.');

    const updated = await setAlertWorkflowStatus({
      alertId: alert.id,
      status: 'investigating',
      scope,
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    expect(updated.status).toBe('investigating');
  });

  it('rejects a Mentor acting on another Group’s alert, even with the real ID', async () => {
    await makeMissingRecordAlertInGroup(groupBId); // not mentorA's group
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const [bAlert] = await listAlertsForViewer(execScope, { chapterId: chapterBId });
    if (!bAlert) throw new Error('No alert.');

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      setAlertWorkflowStatus({ alertId: bAlert.id, status: 'investigating', scope: mentorScope, actor: { id: mentorAId, name: 'Mentor A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('never lets a manual status change masquerade as Çözüldü', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const [alert] = await listAlertsForViewer(scope);
    if (!alert) throw new Error('No alert.');

    // @ts-expect-error -- 'resolved' is intentionally not a valid manual status.
    await expect(setAlertWorkflowStatus({ alertId: alert.id, status: 'resolved', scope, actor: { id: director.userId, name: 'Director' } })).rejects.toThrow();
  });
});

describe('getManagementKpis', () => {
  it('confines a Chapter Head’s KPIs to their own chapter', async () => {
    await makeMissingRecordAlertInGroup(groupAId);
    await makeMissingRecordAlertInGroup(groupBId);
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
    const scope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const kpis = await getManagementKpis(scope);
    expect(kpis.activeChapters).toBe(1);
    expect(kpis.activeGroups).toBe(1);
    expect(kpis.openAlertCount).toBeGreaterThan(0);
  });

  it('gives a role with no management scope all-zero/null KPIs rather than throwing', async () => {
    const student = await createUser({ username: 'student.test', fullName: 'Student', role: 'student', chapterId: chapterAId, academicYearId, actor });
    const scope = await loadAccessScope(student.userId, 'student', academicYearId);
    const kpis = await getManagementKpis(scope);
    expect(kpis.activeChapters).toBe(0);
    expect(kpis.attendanceRate).toBeNull();
  });
});
