import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { auditLogs } from '@/server/db/schema';

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

/** Drops any key that could carry a secret or confidential free text. */
export function sanitizeMetadata(
  data: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!data) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const normalized = key.toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_METADATA_KEYS.some((forbidden) => normalized.includes(forbidden))) continue;
    result[key] = value;
  }
  return result;
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
  actorUserId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};

export async function listAuditLogs(filter: AuditFilter = {}) {
  const conditions: SQL[] = [];
  if (filter.action) conditions.push(eq(auditLogs.action, filter.action));
  if (filter.chapterId) conditions.push(eq(auditLogs.chapterId, filter.chapterId));
  if (filter.actorUserId) conditions.push(eq(auditLogs.actorUserId, filter.actorUserId));
  if (filter.from) conditions.push(gte(auditLogs.createdAt, filter.from));
  if (filter.to) conditions.push(lte(auditLogs.createdAt, filter.to));

  return getDb()
    .select()
    .from(auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(filter.limit ?? 50, 200))
    .offset(filter.offset ?? 0);
}
