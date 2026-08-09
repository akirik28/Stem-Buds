import { and, count, desc, eq, getTableColumns, gte, lt, type SQL } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { academicYears, auditLogs, chapters } from '@/server/db/schema';

/**
 * Audit trail.
 *
 * Sensitive mutations write one record each. Passwords, temporary passwords,
 * reset tokens, session tokens and confidential complaint bodies are never
 * written here — `sanitizeMetadata` strips anything with a suspicious key.
 */

/**
 * Anything that can insert — the shared connection or an open transaction — so
 * a mutation and its audit record commit together.
 */
export type AuditWriter = Pick<Database, 'insert'>;

export const AUDIT_ACTIONS = {
  userCreated: 'user.created',
  userUpdated: 'user.updated',
  userDeactivated: 'user.deactivated',
  userReactivated: 'user.reactivated',
  userRoleChanged: 'user.role_changed',
  passwordResetIssued: 'user.password_reset_issued',
  passwordChanged: 'user.password_changed',
  chapterCreated: 'chapter.created',
  chapterUpdated: 'chapter.updated',
  chapterPublished: 'chapter.published',
  chapterArchived: 'chapter.archived',
  chapterReactivated: 'chapter.reactivated',
  chapterDeleted: 'chapter.deleted',
  groupCreated: 'group.created',
  groupUpdated: 'group.updated',
  groupMembershipChanged: 'group.membership_changed',
  groupMentorAssigned: 'group.mentor_assigned',
  groupArchived: 'group.archived',
  groupReactivated: 'group.reactivated',
  groupDeleted: 'group.deleted',
  attendanceEdited: 'attendance.edited',
  homeworkEdited: 'homework.edited',
  homeworkStatusEdited: 'homework.status_edited',
  weeklyRecordApproved: 'weekly_record.approved',
  weeklyRecordEdited: 'weekly_record.edited',
  projectCreated: 'project.created',
  projectUpdated: 'project.updated',
  projectStatusEdited: 'project.status_edited',
  milestoneCreated: 'milestone.created',
  milestoneStatusChanged: 'milestone.status_changed',
  milestoneDeleted: 'milestone.deleted',
  homeworkAssignmentDeleted: 'homework.assignment_deleted',
  complaintCreated: 'complaint.created',
  complaintStatusChanged: 'complaint.status_changed',
  complaintAssigned: 'complaint.assigned',
  continuousFeedbackSubmitted: 'feedback.submitted',
  continuousFeedbackReviewed: 'feedback.reviewed',
  feedbackCycleResponded: 'feedback_cycle.responded',
  messageDeleted: 'message.deleted',
  mentorMeetingCreated: 'mentor_meeting.created',
  highlightUpdated: 'highlight.updated',
  highlightDeleted: 'highlight.deleted',
  newsCreated: 'news.created',
  newsUpdated: 'news.updated',
  newsPublished: 'news.published',
  newsUnpublished: 'news.unpublished',
  newsDeleted: 'news.deleted',
  leadershipCreated: 'leadership.created',
  leadershipUpdated: 'leadership.updated',
  leadershipPublished: 'leadership.published',
  leadershipDeleted: 'leadership.deleted',
  publicMediaUploaded: 'public_media.uploaded',
  publicMediaDeleted: 'public_media.deleted',
  contactMessageHandled: 'contact_message.handled',
  exportGenerated: 'export.generated',
  programScheduleChanged: 'program.schedule_changed',
  programThresholdsChanged: 'program.thresholds_changed',
  academicYearActivated: 'academic_year.activated',
  academicYearDeleted: 'academic_year.deleted',
  bootstrapExecutiveCreated: 'bootstrap.executive_created',
  advisorProgramsChanged: 'advisor.programs_changed',
  userDeleted: 'user.deleted',
  weeklySessionCancelled: 'weekly_session.cancelled',
  weeklySessionDeleted: 'weekly_session.deleted',
  alertStatusChanged: 'management_alert.status_changed',
  aiInsightGenerated: 'ai_insight.generated',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const FORBIDDEN_METADATA_KEYS = [
  'password',
  'passwordhash',
  'temporarypassword',
  'temppassword',
  'token',
  'secret',
  'cookie',
  'authorization',
  'sessionid',
  'body',
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Recursively drops any key that could carry a secret or confidential free text, at any nesting depth (including inside arrays). Idempotent, so it is safe to re-apply to already-sanitized data. */
function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
      if (FORBIDDEN_METADATA_KEYS.some((forbidden) => normalized.includes(forbidden))) continue;
      result[key] = sanitizeValue(nested);
    }
    return result;
  }
  return value;
}

/** Drops any key that could carry a secret or confidential free text, however deeply nested. */
export function sanitizeMetadata(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!data) return null;
  return sanitizeValue(data) as Record<string, unknown>;
}

export type AuditInput = {
  actorUserId: string | null;
  actorName: string;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  chapterId?: string | null;
  academicYearId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  correlationId?: string | null;
};

/** Records one audit entry, optionally inside an open transaction. */
export async function recordAudit(input: AuditInput, tx?: AuditWriter): Promise<void> {
  const db = tx ?? getDb();
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    chapterId: input.chapterId ?? null,
    academicYearId: input.academicYearId ?? null,
    beforeData: sanitizeMetadata(input.before),
    afterData: sanitizeMetadata(input.after),
    correlationId: input.correlationId ?? null,
  });
}

export type AuditFilter = {
  action?: string;
  chapterId?: string;
  academicYearId?: string;
  actorUserId?: string;
  /** Matches the durable `actorName` snapshot — works even once the account is gone. */
  actorName?: string;
  /** Inclusive lower bound. */
  from?: Date;
  /** Exclusive upper bound — pass the start of the instant *after* the last moment you want included (e.g. the start of the next calendar day, to make a date filter cover that whole day). */
  to?: Date;
  limit?: number;
  offset?: number;
};

/** An audit row plus the display-friendly names its foreign keys resolve to today. */
export type AuditLogEntry = typeof auditLogs.$inferSelect & {
  chapterCode: string | null;
  chapterName: string | null;
  academicYearLabel: string | null;
};

function auditFilterConditions(filter: AuditFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
  if (filter.chapterId) conditions.push(eq(auditLogs.chapterId, filter.chapterId));
  if (filter.academicYearId) conditions.push(eq(auditLogs.academicYearId, filter.academicYearId));
  if (filter.actorUserId) conditions.push(eq(auditLogs.actorUserId, filter.actorUserId));
  if (filter.actorName) conditions.push(eq(auditLogs.actorName, filter.actorName));
  if (filter.from) conditions.push(gte(auditLogs.createdAt, filter.from));
  if (filter.to) conditions.push(lt(auditLogs.createdAt, filter.to));
  return conditions;
}

/**
 * Newest first. `limit` is capped at 200 — the caller is expected to
 * paginate, never load "everything". `beforeData`/`afterData` are
 * re-sanitized here (not just trusted from the write path) so a historical
 * row written before a `sanitizeMetadata` fix, or by any future write path
 * that forgets to call it, still never surfaces a secret to a reader.
 */
export async function listAuditLogs(filter: AuditFilter = {}): Promise<AuditLogEntry[]> {
  const conditions = auditFilterConditions(filter);

  const rows = await getDb()
    .select({
      ...getTableColumns(auditLogs),
      chapterCode: chapters.code,
      chapterName: chapters.name,
      academicYearLabel: academicYears.label,
    })
    .from(auditLogs)
    .leftJoin(chapters, eq(auditLogs.chapterId, chapters.id))
    .leftJoin(academicYears, eq(auditLogs.academicYearId, academicYears.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(filter.limit ?? 50, 200))
    .offset(filter.offset ?? 0);

  return rows.map((row) => ({
    ...row,
    beforeData: sanitizeMetadata(row.beforeData),
    afterData: sanitizeMetadata(row.afterData),
  }));
}

/** Total rows matching `filter`, ignoring `limit`/`offset` — for page-count/next-page controls. */
export async function countAuditLogs(filter: AuditFilter = {}): Promise<number> {
  const conditions = auditFilterConditions(filter);
  const [row] = await getDb()
    .select({ value: count() })
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return row?.value ?? 0;
}

export type AuditActor = { actorUserId: string | null; actorName: string };

/** Every distinct actor who has ever appeared in the log, for a filter dropdown — sourced from the durable name snapshot, not the `users` table, so a deleted account's past actions stay filterable. */
export async function listDistinctAuditActors(): Promise<AuditActor[]> {
  const rows = await getDb()
    .selectDistinct({ actorUserId: auditLogs.actorUserId, actorName: auditLogs.actorName })
    .from(auditLogs)
    .orderBy(auditLogs.actorName);
  return rows;
}
