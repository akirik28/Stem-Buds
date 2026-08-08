import { and, desc, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import {
  attendanceRecords,
  chapterMemberships,
  chapters,
  groupMemberships,
  groups,
  homeworkAssignments,
  homeworkStudentStatuses,
  managementAlerts,
  milestones,
  notifications,
  projects,
  users,
  weeklySessions,
  weeklyWorkLogs,
} from '@/server/db/schema';
import {
  evaluateAttendanceRate,
  evaluateHomeworkRate,
  evaluateProjectHealthAlert,
  evaluateProjectStaleness,
  hasConsecutiveUnexcusedAbsences,
  hasMissedRecentHomework,
  isMilestoneOverdue,
  isWeeklyRecordOverdue,
  type AlertSeverity,
} from '@/server/domain/alert-rules';
import { ALERT_THRESHOLDS } from '@/server/domain/alert-thresholds';
import { consumeRateLimit } from './rate-limit';

/**
 * The deterministic operational alert engine.
 *
 * This is the only place that decides whether an official alert exists, its
 * severity, and who is notified. AI (see `server/ai/`) may later explain an
 * alert that already exists here — it never creates, resolves, or
 * re-prioritizes one.
 *
 * Every rule is evaluated per-Group, strictly within that Group's own
 * Program/Chapter — nothing here ever compares or aggregates across the two
 * Programs.
 */

type AlertCategory =
  | 'missing_weekly_record'
  | 'attendance_risk'
  | 'homework_risk'
  | 'project_stale'
  | 'project_blocked'
  | 'milestone_overdue';

type AlertTab = 'weekly' | 'project';

type PendingAlert = {
  fingerprint: string;
  tab: AlertTab;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
  assignedRoleLabel: string;
};

export type AlertEvaluationSummary = {
  throttled: boolean;
  evaluatedGroups: number;
  created: number;
  updated: number;
  resolved: number;
  failures: number;
};

const GLOBAL_THROTTLE_BUCKET = 'alert-evaluation:global';
const GLOBAL_THROTTLE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Re-evaluates every active Group's deterministic conditions.
 *
 * Idempotent and retry-safe: running this twice in a row (or from two
 * concurrent requests) never creates duplicate alerts, never re-sends a
 * notification for a condition that has already crossed its threshold, and
 * never touches an unrelated Group's alerts. Throttled to once per 5 minutes
 * by default so repeated page loads stay cheap — pass `force: true` only
 * from an explicit, authorized "Yeniden değerlendir"-style trigger.
 */
export async function runAlertEvaluation(options: { force?: boolean } = {}): Promise<AlertEvaluationSummary> {
  if (!options.force) {
    const { allowed } = await consumeRateLimit(GLOBAL_THROTTLE_BUCKET, 1, GLOBAL_THROTTLE_WINDOW_MS);
    if (!allowed) {
      return { throttled: true, evaluatedGroups: 0, created: 0, updated: 0, resolved: 0, failures: 0 };
    }
  }

  const db = getDb();
  const now = new Date();

  const activeGroups = await db
    .select({
      id: groups.id,
      programId: groups.programId,
      chapterId: groups.chapterId,
      academicYearId: groups.academicYearId,
      mentorUserId: groups.mentorUserId,
    })
    .from(groups)
    .where(eq(groups.isActive, true));

  const summary: AlertEvaluationSummary = {
    throttled: false,
    evaluatedGroups: activeGroups.length,
    created: 0,
    updated: 0,
    resolved: 0,
    failures: 0,
  };

  for (const group of activeGroups) {
    try {
      const result = await evaluateGroupAlerts(db, group, now);
      summary.created += result.created;
      summary.updated += result.updated;
      summary.resolved += result.resolved;
    } catch {
      // One Group's evaluation failure must never abort the whole run.
      summary.failures += 1;
    }
  }

  // eslint-disable-next-line no-console -- operational visibility, no PII
  console.log(
    `[alert-engine] evaluated ${summary.evaluatedGroups} groups: +${summary.created} created, ` +
      `${summary.updated} updated, ${summary.resolved} resolved, ${summary.failures} failures`,
  );

  return summary;
}

type GroupRow = {
  id: string;
  programId: string;
  chapterId: string;
  academicYearId: string;
  mentorUserId: string | null;
};

async function evaluateGroupAlerts(
  db: Database,
  group: GroupRow,
  now: Date,
): Promise<{ created: number; updated: number; resolved: number }> {
  return db.transaction(async (tx) => {
    const pending: PendingAlert[] = [];

    pending.push(...(await evaluateMissingWeeklyRecords(tx, group, now)));
    pending.push(...(await evaluateAttendance(tx, group)));
    pending.push(...(await evaluateHomework(tx, group)));

    const project = await getGroupProject(tx, group.id, group.academicYearId);
    if (project) {
      pending.push(...(await evaluateProjectHealthAndBlockers(tx, group, project)));
      pending.push(...(await evaluateMilestones(tx, group, project, now)));
    }

    let created = 0;
    let updated = 0;

    for (const item of pending) {
      const outcome = await upsertAlert(tx, group, item);
      if (outcome === 'created') created += 1;
      else if (outcome === 'updated') updated += 1;
    }

    const stillOpenCategories: AlertCategory[] = [
      'missing_weekly_record',
      'attendance_risk',
      'homework_risk',
      'project_blocked',
      'milestone_overdue',
    ];
    const resolvedCount = await resolveStaleAlerts(
      tx,
      group.id,
      stillOpenCategories,
      new Set(pending.map((p) => p.fingerprint)),
      now,
    );

    // PROJECT_STALE has its own escalation lifecycle — handled separately so
    // a 7-day episode can become a 14-day episode of the *same* alert
    // instead of being diffed away by the generic resolve-if-missing pass.
    const staleOutcome = project
      ? await evaluateProjectStaleness_(tx, group, project, now)
      : { event: 'none' as const };
    if (staleOutcome.event === 'created') created += 1;
    else if (staleOutcome.event === 'escalated' || staleOutcome.event === 'reconfirmed') updated += 1;
    else if (staleOutcome.event === 'resolved') {
      // counted separately below
    }

    return { created, updated, resolved: resolvedCount + (staleOutcome.event === 'resolved' ? 1 : 0) };
  });
}

// ---------------------------------------------------------------------------
// MISSING_WEEKLY_RECORD
// ---------------------------------------------------------------------------

async function evaluateMissingWeeklyRecords(
  tx: Database,
  group: GroupRow,
  now: Date,
): Promise<PendingAlert[]> {
  const rows = await tx
    .select({
      sessionId: weeklySessions.id,
      weekNumber: weeklySessions.weekNumber,
      scheduledEndAt: weeklySessions.scheduledEndAt,
      completedAt: weeklyWorkLogs.completedAt,
    })
    .from(weeklySessions)
    .leftJoin(weeklyWorkLogs, eq(weeklyWorkLogs.weeklySessionId, weeklySessions.id))
    .where(and(eq(weeklySessions.groupId, group.id), eq(weeklySessions.state, 'scheduled'), lt(weeklySessions.scheduledEndAt, now)));

  const out: PendingAlert[] = [];
  for (const row of rows) {
    if (!isWeeklyRecordOverdue(row.scheduledEndAt, row.completedAt, now)) continue;
    out.push({
      fingerprint: `missing_weekly_record:${row.sessionId}`,
      tab: 'weekly',
      category: 'missing_weekly_record',
      severity: 'red',
      title: `${row.weekNumber}. Hafta kaydı eksik`,
      detail: `${row.weekNumber}. hafta oturumu sona erdi ancak haftalık çalışma kaydı 24 saatten uzun süredir tamamlanmadı.`,
      metadata: { sessionId: row.sessionId, weekNumber: row.weekNumber },
      assignedRoleLabel: 'Mentor',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ATTENDANCE_RISK
// ---------------------------------------------------------------------------

async function evaluateAttendance(tx: Database, group: GroupRow): Promise<PendingAlert[]> {
  const out: PendingAlert[] = [];

  const [latestFinalized] = await tx
    .select({ sessionId: weeklySessions.id, weekNumber: weeklySessions.weekNumber })
    .from(weeklyWorkLogs)
    .innerJoin(weeklySessions, eq(weeklySessions.id, weeklyWorkLogs.weeklySessionId))
    .where(and(eq(weeklySessions.groupId, group.id), isNotNull(weeklyWorkLogs.attendanceFinalizedAt)))
    .orderBy(desc(weeklySessions.weekNumber))
    .limit(1);

  if (latestFinalized) {
    const records = await tx
      .select({ status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.weeklySessionId, latestFinalized.sessionId));

    const attended = records.filter((r) => r.status === 'present' || r.status === 'late').length;
    const rate = evaluateAttendanceRate(attended, records.length);
    if (rate) {
      out.push({
        fingerprint: `attendance_risk:${group.id}:${latestFinalized.sessionId}:rate`,
        tab: 'weekly',
        category: 'attendance_risk',
        severity: rate.severity,
        title: 'Katılım oranı düşük',
        detail: `${latestFinalized.weekNumber}. hafta katılım oranı %${Math.round(rate.rate * 100)}.`,
        metadata: { sessionId: latestFinalized.sessionId, weekNumber: latestFinalized.weekNumber, rate: rate.rate },
        assignedRoleLabel: 'Mentor',
      });
    }
  }

  const activeMembers = await tx
    .select({ membershipId: groupMemberships.id, userId: groupMemberships.userId })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.role, 'student'), eq(groupMemberships.isActive, true)));

  for (const member of activeMembers) {
    const recent = await tx
      .select({ status: attendanceRecords.status })
      .from(attendanceRecords)
      .innerJoin(weeklySessions, eq(weeklySessions.id, attendanceRecords.weeklySessionId))
      .where(eq(attendanceRecords.groupMembershipId, member.membershipId))
      .orderBy(desc(weeklySessions.weekNumber))
      .limit(ALERT_THRESHOLDS.consecutiveUnexcusedAbsences);

    if (hasConsecutiveUnexcusedAbsences(recent.map((r) => r.status))) {
      out.push({
        fingerprint: `attendance_risk:${group.id}:${member.membershipId}:consecutive`,
        tab: 'weekly',
        category: 'attendance_risk',
        severity: 'yellow',
        title: 'Öğrenci art arda katılmadı',
        detail: `Bir öğrenci son ${ALERT_THRESHOLDS.consecutiveUnexcusedAbsences} oturuma art arda mazeretsiz katılmadı.`,
        metadata: { groupMembershipId: member.membershipId },
        assignedRoleLabel: 'Mentor',
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// HOMEWORK_RISK
// ---------------------------------------------------------------------------

async function evaluateHomework(tx: Database, group: GroupRow): Promise<PendingAlert[]> {
  const out: PendingAlert[] = [];

  const [latestFinalized] = await tx
    .select({ assignmentId: homeworkAssignments.id, weeklySessionId: homeworkAssignments.weeklySessionId })
    .from(homeworkAssignments)
    .innerJoin(weeklySessions, eq(weeklySessions.id, homeworkAssignments.weeklySessionId))
    .where(and(eq(homeworkAssignments.groupId, group.id), isNotNull(homeworkAssignments.resultsFinalizedAt)))
    .orderBy(desc(weeklySessions.weekNumber))
    .limit(1);

  if (latestFinalized) {
    const statuses = await tx
      .select({ status: homeworkStudentStatuses.status })
      .from(homeworkStudentStatuses)
      .where(eq(homeworkStudentStatuses.assignmentId, latestFinalized.assignmentId));

    const done = statuses.filter((s) => s.status === 'done').length;
    const applicable = statuses.filter((s) => s.status !== 'excused').length;
    const rate = evaluateHomeworkRate(done, applicable);
    if (rate) {
      out.push({
        fingerprint: `homework_risk:${group.id}:${latestFinalized.assignmentId}:rate`,
        tab: 'weekly',
        category: 'homework_risk',
        severity: rate.severity,
        title: 'Ödev tamamlama oranı düşük',
        detail: `Son ödevde tamamlama oranı %${Math.round(rate.rate * 100)}.`,
        metadata: { assignmentId: latestFinalized.assignmentId, rate: rate.rate },
        assignedRoleLabel: 'Mentor',
      });
    }
  }

  const activeMembers = await tx
    .select({ membershipId: groupMemberships.id })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.role, 'student'), eq(groupMemberships.isActive, true)));

  for (const member of activeMembers) {
    const recent = await tx
      .select({ status: homeworkStudentStatuses.status, weekNumber: weeklySessions.weekNumber })
      .from(homeworkStudentStatuses)
      .innerJoin(homeworkAssignments, eq(homeworkAssignments.id, homeworkStudentStatuses.assignmentId))
      .innerJoin(weeklySessions, eq(weeklySessions.id, homeworkAssignments.weeklySessionId))
      .where(
        and(
          eq(homeworkStudentStatuses.groupMembershipId, member.membershipId),
          isNotNull(homeworkAssignments.resultsFinalizedAt),
        ),
      )
      .orderBy(desc(weeklySessions.weekNumber))
      .limit(ALERT_THRESHOLDS.homeworkMissedWindow);

    if (hasMissedRecentHomework(recent.map((r) => r.status))) {
      out.push({
        fingerprint: `homework_risk:${group.id}:${member.membershipId}:missed`,
        tab: 'weekly',
        category: 'homework_risk',
        severity: 'yellow',
        title: 'Öğrenci son ödevleri kaçırdı',
        detail: `Bir öğrenci son ${ALERT_THRESHOLDS.homeworkMissedWindow} uygulanabilir ödevin en az ${ALERT_THRESHOLDS.homeworkMissedCount} tanesini yapmadı.`,
        metadata: { groupMembershipId: member.membershipId },
        assignedRoleLabel: 'Mentor',
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// PROJECT_BLOCKED (health readings + reported blocker text)
// ---------------------------------------------------------------------------

type ProjectRow = typeof projects.$inferSelect;

async function getGroupProject(tx: Database, groupId: string, academicYearId: string): Promise<ProjectRow | null> {
  const [row] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.groupId, groupId), eq(projects.academicYearId, academicYearId)))
    .limit(1);
  return row ?? null;
}

async function evaluateProjectHealthAndBlockers(
  tx: Database,
  group: GroupRow,
  project: ProjectRow,
): Promise<PendingAlert[]> {
  const out: PendingAlert[] = [];

  const recentLogs = await tx
    .select({ projectHealth: weeklyWorkLogs.projectHealth, problems: weeklyWorkLogs.problems })
    .from(weeklyWorkLogs)
    .innerJoin(weeklySessions, eq(weeklySessions.id, weeklyWorkLogs.weeklySessionId))
    .where(and(eq(weeklySessions.groupId, group.id), isNotNull(weeklyWorkLogs.completedAt)))
    .orderBy(desc(weeklySessions.weekNumber))
    .limit(2);

  const healthReadings = recentLogs.map((l) => l.projectHealth).filter((h): h is 'on_track' | 'attention' | 'delayed' => h !== null);
  const healthAlert = evaluateProjectHealthAlert(healthReadings);
  if (healthAlert) {
    out.push({
      fingerprint: `project_blocked:${project.id}:health`,
      tab: 'project',
      category: 'project_blocked',
      severity: healthAlert.severity,
      title: healthAlert.reason === 'red' ? 'Proje durumu: Gecikiyor' : 'Proje iki haftadır dikkat gerektiriyor',
      detail:
        healthAlert.reason === 'red'
          ? 'Son haftalık kayıtta proje durumu "Gecikiyor" olarak işaretlendi.'
          : 'Son iki haftalık kayıtta proje durumu art arda "Dikkat Gerekiyor" olarak işaretlendi.',
      metadata: { projectId: project.id, reason: healthAlert.reason },
      assignedRoleLabel: 'Mentor',
    });
  }

  const latestProblem = recentLogs[0]?.problems?.trim();
  if (latestProblem) {
    out.push({
      fingerprint: `project_blocked:${project.id}:blocker`,
      tab: 'project',
      category: 'project_blocked',
      severity: 'yellow',
      title: 'Projede aktif bir engel var',
      detail: latestProblem,
      metadata: { projectId: project.id },
      assignedRoleLabel: 'Mentor',
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// MILESTONE_OR_TASK_OVERDUE
// ---------------------------------------------------------------------------

async function evaluateMilestones(
  tx: Database,
  group: GroupRow,
  project: ProjectRow,
  now: Date,
): Promise<PendingAlert[]> {
  const rows = await tx
    .select({ id: milestones.id, title: milestones.title, dueDate: milestones.dueDate, status: milestones.status })
    .from(milestones)
    .where(eq(milestones.projectId, project.id));

  const out: PendingAlert[] = [];
  for (const milestone of rows) {
    if (!isMilestoneOverdue(milestone.dueDate, milestone.status, now)) continue;
    out.push({
      fingerprint: `milestone_overdue:${milestone.id}`,
      tab: 'project',
      category: 'milestone_overdue',
      severity: 'yellow',
      title: 'Milestone gecikti',
      detail: `"${milestone.title}" milestone'ının hedef tarihi geçti.`,
      metadata: { milestoneId: milestone.id, projectId: project.id },
      assignedRoleLabel: 'Mentor',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// PROJECT_STALE — the exact 7/14-day escalation ladder (Section 3.7)
// ---------------------------------------------------------------------------

async function getLastProjectProgressAt(tx: Database, groupId: string, project: ProjectRow): Promise<Date> {
  const [latest] = await tx
    .select({ completedAt: weeklyWorkLogs.completedAt })
    .from(weeklyWorkLogs)
    .innerJoin(weeklySessions, eq(weeklySessions.id, weeklyWorkLogs.weeklySessionId))
    .where(and(eq(weeklySessions.groupId, groupId), isNotNull(weeklyWorkLogs.completedAt)))
    .orderBy(desc(weeklyWorkLogs.completedAt))
    .limit(1);
  if (latest?.completedAt) return latest.completedAt;
  return project.startDate ? new Date(`${project.startDate}T00:00:00Z`) : project.createdAt;
}

type StaleOutcome = { event: 'none' | 'created' | 'escalated' | 'reconfirmed' | 'resolved' };

async function evaluateProjectStaleness_(
  tx: Database,
  group: GroupRow,
  project: ProjectRow,
  now: Date,
): Promise<StaleOutcome> {
  const fingerprint = `project_stale:${project.id}`;

  const [existingOpen] = await tx
    .select()
    .from(managementAlerts)
    .where(and(eq(managementAlerts.fingerprint, fingerprint), inArray(managementAlerts.status, ['new', 'investigating'])))
    .limit(1);

  // A finally-delivered project is a terminal state in the current domain
  // model (there is no separate completed/paused/archived status) — never
  // stale from here on.
  if (project.finalDelivered) {
    if (existingOpen) {
      await tx
        .update(managementAlerts)
        .set({ status: 'resolved', resolvedAt: now, updatedAt: now })
        .where(eq(managementAlerts.id, existingOpen.id));
      return { event: 'resolved' };
    }
    return { event: 'none' };
  }

  const lastProgressAt = await getLastProjectProgressAt(tx, group.id, project);
  const daysSince = (now.getTime() - lastProgressAt.getTime()) / (1000 * 60 * 60 * 24);
  const stage = evaluateProjectStaleness(daysSince);

  if (stage === null) {
    if (existingOpen) {
      await tx
        .update(managementAlerts)
        .set({ status: 'resolved', resolvedAt: now, updatedAt: now })
        .where(eq(managementAlerts.id, existingOpen.id));
      return { event: 'resolved' };
    }
    return { event: 'none' };
  }

  const severity: AlertSeverity = stage === 14 ? 'red' : 'yellow';
  const title = stage === 14 ? 'Proje 14 gündür güncellenmedi' : 'Proje 7 gündür güncellenmedi';
  const detail = `Son proje ilerleme kaydından bu yana ${Math.floor(daysSince)} gün geçti.`;
  const assignedRoleLabel = stage === 14 ? 'Mentor · Chapter Head · Üst Yönetim' : 'Mentor · Chapter Head';
  const metadata = { projectId: project.id, daysSinceProgress: Math.floor(daysSince), stage };

  if (!existingOpen) {
    await tx.insert(managementAlerts).values({
      fingerprint,
      tab: 'project',
      category: 'project_stale',
      severity,
      programId: group.programId,
      academicYearId: group.academicYearId,
      chapterId: group.chapterId,
      groupId: group.id,
      title,
      detail,
      metadata,
      autoResolvable: true,
      assignedRoleLabel,
    });
    await notifyStaleProjectStage(tx, group, stage);
    return { event: 'created' };
  }

  const previousStage = (existingOpen.metadata as { stage?: number } | null)?.stage ?? 7;
  await tx
    .update(managementAlerts)
    .set({ severity, title, detail, metadata, assignedRoleLabel, lastEvaluatedAt: now, updatedAt: now })
    .where(eq(managementAlerts.id, existingOpen.id));

  if (stage > previousStage) {
    await notifyStaleProjectStage(tx, group, stage);
    return { event: 'escalated' };
  }
  return { event: 'reconfirmed' };
}

async function notifyStaleProjectStage(tx: Database, group: GroupRow, stage: 7 | 14): Promise<void> {
  const recipientIds = new Set<string>();
  if (group.mentorUserId) recipientIds.add(group.mentorUserId);

  const heads = await tx
    .select({ userId: chapterMemberships.userId })
    .from(chapterMemberships)
    .where(
      and(
        eq(chapterMemberships.chapterId, group.chapterId),
        eq(chapterMemberships.academicYearId, group.academicYearId),
        eq(chapterMemberships.role, 'chapter_head'),
        eq(chapterMemberships.isActive, true),
      ),
    );
  heads.forEach((h) => recipientIds.add(h.userId));

  if (stage === 14) {
    const executives = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.role, ['regional_director', 'vice_president']), eq(users.isActive, true)));
    executives.forEach((e) => recipientIds.add(e.id));
  }

  if (recipientIds.size === 0) return;
  const [chapter] = await tx.select({ name: chapters.name }).from(chapters).where(eq(chapters.id, group.chapterId)).limit(1);
  const title = stage === 14 ? 'Proje 14 gündür güncellenmedi' : 'Proje 7 gündür güncellenmedi';
  const body = `${chapter?.name ?? 'Bir chapter'} içindeki bir grubun projesinde ${stage} gündür ilerleme kaydı girilmedi.`;
  await tx.insert(notifications).values(
    [...recipientIds].map((userId) => ({
      userId,
      type: 'alert_project_stale',
      title,
      body,
      linkUrl: `/panel/gruplar/${group.chapterId}/${group.id}/proje`,
    })),
  );
}

// ---------------------------------------------------------------------------
// Shared upsert / resolve helpers
// ---------------------------------------------------------------------------

async function upsertAlert(tx: Database, group: GroupRow, item: PendingAlert): Promise<'created' | 'updated'> {
  const [existingOpen] = await tx
    .select({ id: managementAlerts.id })
    .from(managementAlerts)
    .where(and(eq(managementAlerts.fingerprint, item.fingerprint), inArray(managementAlerts.status, ['new', 'investigating'])))
    .limit(1);

  if (existingOpen) {
    await tx
      .update(managementAlerts)
      .set({
        severity: item.severity,
        title: item.title,
        detail: item.detail,
        metadata: item.metadata,
        lastEvaluatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(managementAlerts.id, existingOpen.id));
    return 'updated';
  }

  await tx.insert(managementAlerts).values({
    fingerprint: item.fingerprint,
    tab: item.tab,
    category: item.category,
    severity: item.severity,
    programId: group.programId,
    academicYearId: group.academicYearId,
    chapterId: group.chapterId,
    groupId: group.id,
    title: item.title,
    detail: item.detail,
    metadata: item.metadata,
    autoResolvable: true,
    assignedRoleLabel: item.assignedRoleLabel,
  });
  return 'created';
}

/**
 * Resolves any open alert, in the given categories for this Group, whose
 * fingerprint was not reconfirmed by the current evaluation pass — the
 * underlying condition is gone. History is preserved: this updates `status`,
 * it never deletes the row.
 */
async function resolveStaleAlerts(
  tx: Database,
  groupId: string,
  categories: AlertCategory[],
  stillTriggeredFingerprints: Set<string>,
  now: Date,
): Promise<number> {
  const openAlerts = await tx
    .select({ id: managementAlerts.id, fingerprint: managementAlerts.fingerprint })
    .from(managementAlerts)
    .where(
      and(
        eq(managementAlerts.groupId, groupId),
        inArray(managementAlerts.category, categories),
        inArray(managementAlerts.status, ['new', 'investigating']),
        eq(managementAlerts.autoResolvable, true),
      ),
    );

  const toResolve = openAlerts.filter((a) => !stillTriggeredFingerprints.has(a.fingerprint));
  if (toResolve.length === 0) return 0;

  await tx
    .update(managementAlerts)
    .set({ status: 'resolved', resolvedAt: now, updatedAt: now })
    .where(
      inArray(
        managementAlerts.id,
        toResolve.map((a) => a.id),
      ),
    );
  return toResolve.length;
}
