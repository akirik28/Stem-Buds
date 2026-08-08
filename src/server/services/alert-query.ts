import { and, desc, eq, gte, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { getDb } from '@/server/db';
import {
  attendanceRecords,
  chapters,
  groups,
  homeworkAssignments,
  homeworkStudentStatuses,
  managementAlerts,
  weeklySessions,
  weeklyWorkLogs,
} from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import {
  canManageChapter,
  isChapterHead,
  isExecutive,
  isMentor,
  type AccessScope,
} from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * Read/write access to `management_alerts`, scoped exactly like every other
 * protected read in the product: build the WHERE clause from the caller's
 * server-verified `AccessScope`, never from a client-supplied filter alone.
 */

export type ManagementAlert = typeof managementAlerts.$inferSelect;

export type AlertListFilter = {
  programId?: string;
  tab?: 'weekly' | 'project';
  severity?: 'info' | 'yellow' | 'red';
  status?: 'new' | 'investigating' | 'resolved' | 'closed';
  chapterId?: string;
};

/**
 * The 7-day `PROJECT_STALE` stage is intentionally invisible in the default
 * Executive feed — see Section 3.7.3 — even though Executives otherwise have
 * blanket read access. Only Chapter Head/Mentor (its actual day-7 audience)
 * and the 14-day-escalated stage bypass this filter.
 */
async function countRows(query: Promise<{ count: number }[]>): Promise<number> {
  const rows = await query;
  return rows[0]?.count ?? 0;
}

const EXECUTIVE_HIDES_EARLY_STALE: SQL = or(
  ne(managementAlerts.category, 'project_stale'),
  sql`(${managementAlerts.metadata} ->> 'stage')::int >= 14`,
)!;

/**
 * Lists alerts visible to the caller. Returns an empty list — never an
 * error — for a role with no alert-feed surface at all (Student, Team
 * Leader, Advisor Teacher see alerts only as AI-summary evidence, not this
 * raw feed).
 */
export async function listAlertsForViewer(scope: AccessScope, filter: AlertListFilter = {}): Promise<ManagementAlert[]> {
  const conditions: SQL[] = [eq(managementAlerts.status, filter.status ?? 'new')];
  if (filter.status === undefined) {
    // Default view: both open workflow states, never resolved/closed history.
    conditions[0] = inArray(managementAlerts.status, ['new', 'investigating']);
  }
  if (filter.programId) conditions.push(eq(managementAlerts.programId, filter.programId));
  if (filter.tab) conditions.push(eq(managementAlerts.tab, filter.tab));
  if (filter.severity) conditions.push(eq(managementAlerts.severity, filter.severity));

  if (isExecutive(scope.role)) {
    conditions.push(EXECUTIVE_HIDES_EARLY_STALE);
    if (filter.chapterId) conditions.push(eq(managementAlerts.chapterId, filter.chapterId));
  } else if (isChapterHead(scope.role)) {
    if (scope.headChapterIds.length === 0) return [];
    conditions.push(inArray(managementAlerts.chapterId, [...scope.headChapterIds]));
  } else {
    // Mentor (and every other role) does not get the Yönetim Akışı feed —
    // per spec, a Mentor's assigned-Group alerts surface only through
    // `listAlertsForMentor`'s separate, compact "Dikkat Gerektirenler" view.
    return [];
  }

  return getDb()
    .select()
    .from(managementAlerts)
    .where(and(...conditions))
    .orderBy(desc(managementAlerts.severity), desc(managementAlerts.firstDetectedAt))
    .limit(200);
}

/** Compact, read-only feed for a Mentor's own "Dikkat Gerektirenler" surface. */
export async function listAlertsForMentor(scope: AccessScope): Promise<ManagementAlert[]> {
  if (!isMentor(scope.role) || scope.mentorGroupIds.length === 0) return [];
  return getDb()
    .select()
    .from(managementAlerts)
    .where(and(inArray(managementAlerts.groupId, [...scope.mentorGroupIds]), inArray(managementAlerts.status, ['new', 'investigating'])))
    .orderBy(desc(managementAlerts.severity), desc(managementAlerts.firstDetectedAt))
    .limit(50);
}

/**
 * Whether `scope` may manually transition `alert`'s workflow status —
 * shared by the mutating action below and every UI surface that decides
 * whether to render the workflow controls, so visibility and enforcement
 * can never diverge. Mentor is included because the engine's `Sorumlu`
 * (`assignedRoleLabel`) is always "Mentor" for Group-level alert
 * categories — the Mentor is the spec's "authorized recipient" for their
 * own Groups' alerts, not only Chapter Head/Executive.
 */
export function canManageAlertWorkflow(scope: AccessScope, alert: ManagementAlert): boolean {
  if (isExecutive(scope.role)) return true;
  if (alert.chapterId && canManageChapter(scope, alert.chapterId)) return true;
  if (alert.groupId && isMentor(scope.role)) return scope.mentorGroupIds.includes(alert.groupId);
  return false;
}

/**
 * Human acknowledgement/workflow only — `İnceleniyor` or `Kapatıldı`. Never
 * `Çözüldü`: that state is only ever written by the deterministic engine
 * once it re-verifies the underlying condition is actually gone, so a human
 * can never falsely claim a still-active issue is fixed.
 */
export async function setAlertWorkflowStatus(input: {
  alertId: string;
  status: 'investigating' | 'closed';
  scope: AccessScope;
  actor: { id: string | null; name: string };
}): Promise<ManagementAlert> {
  // Defensive against a caller that bypasses the TypeScript parameter type
  // (e.g. an unvalidated string read from FormData in a Server Action):
  // 'resolved' is never a legal manual target, only the deterministic engine
  // may ever write it.
  if (input.status !== 'investigating' && input.status !== 'closed') {
    throw validationError('Geçersiz durum.');
  }

  return getDb().transaction(async (tx) => {
    const [alert] = await tx.select().from(managementAlerts).where(eq(managementAlerts.id, input.alertId)).limit(1);
    if (!alert) throw notFound('Uyarı bulunamadı.');
    if (!canManageAlertWorkflow(input.scope, alert)) {
      throw validationError('Bu uyarıyı güncelleme yetkiniz yok.');
    }
    if (!['new', 'investigating', 'closed'].includes(alert.status)) {
      throw validationError('Çözülmüş bir uyarının durumu elle değiştirilemez.');
    }

    const [updated] = await tx
      .update(managementAlerts)
      .set({
        status: input.status,
        closedAt: input.status === 'closed' ? new Date() : alert.closedAt,
        updatedAt: new Date(),
      })
      .where(eq(managementAlerts.id, input.alertId))
      .returning();
    if (!updated) throw notFound('Uyarı bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.alertStatusChanged,
        targetType: 'management_alert',
        targetId: updated.id,
        targetLabel: updated.title,
        chapterId: updated.chapterId,
        before: { status: alert.status },
        after: { status: updated.status },
      },
      tx,
    );

    return updated;
  });
}

export type ManagementKpis = {
  activeChapters: number;
  activeGroups: number;
  attendanceRate: number | null;
  homeworkCompletionRate: number | null;
  weeklyRecordCompletionRate: number | null;
  projectsNeedingAttention: number;
  openAlertCount: number;
};

/**
 * Concise, truthfully-available KPIs for the top of Yönetim Akışı — every
 * number here is computed deterministically in application code, the same
 * way an AI-generated summary is never allowed to invent or recompute one.
 */
export async function getManagementKpis(scope: AccessScope, filter: { programId?: string } = {}): Promise<ManagementKpis> {
  const db = getDb();

  const chapterConditions: SQL[] = [eq(chapters.isActive, true)];
  if (filter.programId) chapterConditions.push(eq(chapters.programId, filter.programId));
  if (isChapterHead(scope.role)) {
    if (scope.headChapterIds.length === 0) {
      return {
        activeChapters: 0,
        activeGroups: 0,
        attendanceRate: null,
        homeworkCompletionRate: null,
        weeklyRecordCompletionRate: null,
        projectsNeedingAttention: 0,
        openAlertCount: 0,
      };
    }
    chapterConditions.push(inArray(chapters.id, [...scope.headChapterIds]));
  } else if (!isExecutive(scope.role)) {
    return {
      activeChapters: 0,
      activeGroups: 0,
      attendanceRate: null,
      homeworkCompletionRate: null,
      weeklyRecordCompletionRate: null,
      projectsNeedingAttention: 0,
      openAlertCount: 0,
    };
  }

  const activeChapters = await countRows(
    db.select({ count: sql<number>`count(*)::int` }).from(chapters).where(and(...chapterConditions)),
  );

  const groupConditions: SQL[] = [eq(groups.isActive, true)];
  if (filter.programId) groupConditions.push(eq(groups.programId, filter.programId));
  if (isChapterHead(scope.role)) groupConditions.push(inArray(groups.chapterId, [...scope.headChapterIds]));
  const activeGroups = await countRows(
    db.select({ count: sql<number>`count(*)::int` }).from(groups).where(and(...groupConditions)),
  );

  // Weekly-record completion over the last 30 days of already-past sessions.
  const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recordConditions: SQL[] = [gte(weeklySessions.scheduledEndAt, windowStart), eq(weeklySessions.state, 'scheduled')];
  if (filter.programId) recordConditions.push(eq(groups.programId, filter.programId));
  if (isChapterHead(scope.role)) recordConditions.push(inArray(groups.chapterId, [...scope.headChapterIds]));
  const recordRows = await db
    .select({ completedAt: weeklyWorkLogs.completedAt })
    .from(weeklySessions)
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .leftJoin(weeklyWorkLogs, eq(weeklyWorkLogs.weeklySessionId, weeklySessions.id))
    .where(and(...recordConditions, sql`${weeklySessions.scheduledEndAt} < now()`));
  const weeklyRecordCompletionRate =
    recordRows.length > 0 ? recordRows.filter((r) => r.completedAt !== null).length / recordRows.length : null;

  const attendanceConditions: SQL[] = [gte(weeklySessions.scheduledEndAt, windowStart)];
  if (filter.programId) attendanceConditions.push(eq(groups.programId, filter.programId));
  if (isChapterHead(scope.role)) attendanceConditions.push(inArray(groups.chapterId, [...scope.headChapterIds]));
  const attendanceRows = await db
    .select({ status: attendanceRecords.status })
    .from(attendanceRecords)
    .innerJoin(weeklySessions, eq(weeklySessions.id, attendanceRecords.weeklySessionId))
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .where(and(...attendanceConditions));
  const attendanceRate =
    attendanceRows.length > 0
      ? attendanceRows.filter((r) => r.status === 'present' || r.status === 'late').length / attendanceRows.length
      : null;

  const homeworkConditions: SQL[] = [
    gte(weeklySessions.scheduledEndAt, windowStart),
    ne(homeworkStudentStatuses.status, 'excused'),
    ne(homeworkStudentStatuses.status, 'pending'),
  ];
  if (filter.programId) homeworkConditions.push(eq(groups.programId, filter.programId));
  if (isChapterHead(scope.role)) homeworkConditions.push(inArray(groups.chapterId, [...scope.headChapterIds]));
  const homeworkRows = await db
    .select({ status: homeworkStudentStatuses.status })
    .from(homeworkStudentStatuses)
    .innerJoin(homeworkAssignments, eq(homeworkAssignments.id, homeworkStudentStatuses.assignmentId))
    .innerJoin(weeklySessions, eq(weeklySessions.id, homeworkAssignments.weeklySessionId))
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .where(and(...homeworkConditions));
  const homeworkCompletionRate =
    homeworkRows.length > 0 ? homeworkRows.filter((r) => r.status === 'done').length / homeworkRows.length : null;

  const alertConditions: SQL[] = [inArray(managementAlerts.status, ['new', 'investigating'])];
  if (filter.programId) alertConditions.push(eq(managementAlerts.programId, filter.programId));
  if (isChapterHead(scope.role)) alertConditions.push(inArray(managementAlerts.chapterId, [...scope.headChapterIds]));
  else alertConditions.push(EXECUTIVE_HIDES_EARLY_STALE);
  const openAlertCount = await countRows(
    db.select({ count: sql<number>`count(*)::int` }).from(managementAlerts).where(and(...alertConditions)),
  );

  const projectAlertConditions: SQL[] = [...alertConditions, eq(managementAlerts.tab, 'project')];
  const projectsNeedingAttention = await countRows(
    db
      .select({ count: sql<number>`count(distinct ${managementAlerts.groupId})::int` })
      .from(managementAlerts)
      .where(and(...projectAlertConditions)),
  );

  return {
    activeChapters,
    activeGroups,
    attendanceRate,
    homeworkCompletionRate,
    weeklyRecordCompletionRate,
    projectsNeedingAttention,
    openAlertCount,
  };
}
