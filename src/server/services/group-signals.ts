import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { attendanceRecords, groups, homeworkAssignments, homeworkStudentStatuses, managementAlerts, projects, weeklySessions, weeklyWorkLogs } from '@/server/db/schema';

/**
 * The minimized, non-identifying per-Group fact bundle every bounded AI
 * summary surface (Chapter Head's "Grup Durumları", Advisor's "Grup
 * Özetleri") is built from. Deliberately excludes student names, contact
 * info, and anything not already required to explain the Group's current
 * state — see Section 7 of the Phase 5 spec.
 */
export type GroupSignals = {
  groupRef: string;
  attendanceRate: number | null;
  homeworkRate: number | null;
  daysSinceProjectProgress: number | null;
  projectHealth: 'on_track' | 'attention' | 'delayed' | null;
  blockerText: string | null;
  nextStep: string | null;
  activeAlertCategories: string[];
};

export async function getGroupSignals(groupId: string, academicYearId: string): Promise<GroupSignals> {
  const db = getDb();

  const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId)).limit(1);

  const [latestAttendanceSession] = await db
    .select({ sessionId: weeklySessions.id })
    .from(weeklyWorkLogs)
    .innerJoin(weeklySessions, eq(weeklySessions.id, weeklyWorkLogs.weeklySessionId))
    .where(and(eq(weeklySessions.groupId, groupId), isNotNull(weeklyWorkLogs.attendanceFinalizedAt)))
    .orderBy(desc(weeklySessions.weekNumber))
    .limit(1);
  let attendanceRate: number | null = null;
  if (latestAttendanceSession) {
    const records = await db
      .select({ status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.weeklySessionId, latestAttendanceSession.sessionId));
    if (records.length > 0) {
      attendanceRate = records.filter((r) => r.status === 'present' || r.status === 'late').length / records.length;
    }
  }

  const [latestHomework] = await db
    .select({ assignmentId: homeworkAssignments.id })
    .from(homeworkAssignments)
    .innerJoin(weeklySessions, eq(weeklySessions.id, homeworkAssignments.weeklySessionId))
    .where(and(eq(homeworkAssignments.groupId, groupId), isNotNull(homeworkAssignments.resultsFinalizedAt)))
    .orderBy(desc(weeklySessions.weekNumber))
    .limit(1);
  let homeworkRate: number | null = null;
  if (latestHomework) {
    const statuses = await db
      .select({ status: homeworkStudentStatuses.status })
      .from(homeworkStudentStatuses)
      .where(eq(homeworkStudentStatuses.assignmentId, latestHomework.assignmentId));
    const applicable = statuses.filter((s) => s.status !== 'excused' && s.status !== 'pending');
    if (applicable.length > 0) {
      homeworkRate = applicable.filter((s) => s.status === 'done').length / applicable.length;
    }
  }

  const [project] = await db
    .select({ id: projects.id, health: projects.health, startDate: projects.startDate, createdAt: projects.createdAt })
    .from(projects)
    .where(and(eq(projects.groupId, groupId), eq(projects.academicYearId, academicYearId)))
    .limit(1);

  let daysSinceProjectProgress: number | null = null;
  let blockerText: string | null = null;
  let nextStep: string | null = null;
  let projectHealth: 'on_track' | 'attention' | 'delayed' | null = null;

  if (project) {
    const [latestLog] = await db
      .select({ completedAt: weeklyWorkLogs.completedAt, problems: weeklyWorkLogs.problems, nextWeekGoal: weeklyWorkLogs.nextWeekGoal, projectHealth: weeklyWorkLogs.projectHealth })
      .from(weeklyWorkLogs)
      .innerJoin(weeklySessions, eq(weeklySessions.id, weeklyWorkLogs.weeklySessionId))
      .where(and(eq(weeklySessions.groupId, groupId), isNotNull(weeklyWorkLogs.completedAt)))
      .orderBy(desc(weeklyWorkLogs.completedAt))
      .limit(1);

    const lastProgressAt = latestLog?.completedAt ?? (project.startDate ? new Date(`${project.startDate}T00:00:00Z`) : project.createdAt);
    daysSinceProjectProgress = Math.floor((Date.now() - lastProgressAt.getTime()) / (1000 * 60 * 60 * 24));
    blockerText = latestLog?.problems?.trim() || null;
    nextStep = latestLog?.nextWeekGoal?.trim() || null;
    projectHealth = latestLog?.projectHealth ?? project.health;
  }

  const alerts = await db
    .select({ category: managementAlerts.category })
    .from(managementAlerts)
    .where(and(eq(managementAlerts.groupId, groupId), inArray(managementAlerts.status, ['new', 'investigating'])));

  return {
    groupRef: group?.name ?? 'Grup',
    attendanceRate,
    homeworkRate,
    daysSinceProjectProgress,
    projectHealth,
    blockerText,
    nextStep,
    activeAlertCategories: [...new Set(alerts.map((a) => a.category))],
  };
}
