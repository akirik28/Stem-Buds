import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * System-wide role of a user account.
 *
 * `regional_director` and `vice_president` together form Executive
 * Management ("Üst Yönetim"). Multiple people can hold `regional_director`
 * at once (e.g. Ada Sarp Kırık and Hande Özcan) with fully equal authority —
 * it is not a hierarchy, so there is no separate "co-director" role beneath
 * or alongside it.
 */
export const userRoleEnum = pgEnum('user_role', [
  'regional_director',
  'vice_president',
  'chapter_head',
  'mentor',
  'student',
  'advisor_teacher',
]);

/** Role a user holds inside a specific discipline group. */
export const groupRoleEnum = pgEnum('group_role', ['mentor', 'student']);

/** Official attendance outcome for one student in one weekly session. */
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'late',
  'absent',
  'excused',
]);

/** Official completion outcome of one homework assignment for one student. */
export const homeworkStatusEnum = pgEnum('homework_status', [
  'pending',
  'done',
  'not_done',
  'excused',
]);

/** Traffic-light health of a project as judged in a weekly session. */
export const projectHealthEnum = pgEnum('project_health', ['on_track', 'attention', 'delayed']);

/** Lifecycle of a generated weekly session. */
export const weeklySessionStateEnum = pgEnum('weekly_session_state', [
  'scheduled',
  'cancelled',
  'holiday',
]);

/** Lifecycle of a milestone. */
export const milestoneStatusEnum = pgEnum('milestone_status', [
  'planned',
  'in_progress',
  'completed',
]);

/** Severity of a management alert. */
export const alertSeverityEnum = pgEnum('alert_severity', ['info', 'yellow', 'red']);

/** Workflow state of a management alert. */
export const alertStatusEnum = pgEnum('alert_status', [
  'new',
  'investigating',
  'resolved',
  'closed',
]);

/** Which management-feed tab an alert belongs to. */
export const alertTabEnum = pgEnum('alert_tab', ['weekly', 'project', 'feedback']);

/**
 * The deterministic condition an alert represents. `session_attention` (a
 * missed/at-risk planned session) is deliberately not a separate value here:
 * the current domain model only ever detects that as "the weekly record is
 * still incomplete >24h after the session", which is `missing_weekly_record`
 * — a second category for the same condition would just be duplicate-alert
 * risk under a different name. Likewise there is no
 * `mentor_followup_missing`: no existing business rule defines what a
 * "missing mentor follow-up" is independent of the categories below.
 */
export const alertCategoryEnum = pgEnum('alert_category', [
  'missing_weekly_record',
  'attendance_risk',
  'homework_risk',
  'project_stale',
  'project_blocked',
  'milestone_overdue',
]);

/** Which bounded Phase 5 AI surface produced a cached insight. */
export const aiInsightTypeEnum = pgEnum('ai_insight_type', [
  /** "Haftalık Özet" — REGIONAL_DIRECTOR / VICE_DIRECTOR. */
  'weekly_summary',
  /** "Grup Durumları" — CHAPTER_HEAD. */
  'chapter_group_status',
  /** "Verilere Sor" — REGIONAL_DIRECTOR / VICE_DIRECTOR only. */
  'data_question',
  /** "Dikkat Gerektirenler" explanation — MENTOR. */
  'mentor_alert_explainer',
  /** "Grup Özetleri" — ADVISOR_TEACHER, one entry per authorized Group. */
  'advisor_group_summary',
]);

/** What kind of scope an `ai_insights` cache row is keyed to. */
export const aiScopeTypeEnum = pgEnum('ai_scope_type', [
  'organization',
  'program',
  'chapter',
  /** Keyed to a Mentor's own user ID — "their assigned Groups" as of generation time. */
  'mentor',
  'group',
]);

/** Category chosen by a student when sending continuous feedback. */
export const feedbackCategoryEnum = pgEnum('feedback_category', [
  'mentor',
  'group',
  'program',
  'weekly_sessions',
  'platform',
  'other',
]);

/** Category chosen by a student when filing a complaint. */
export const complaintCategoryEnum = pgEnum('complaint_category', [
  'about_mentor',
  'group_problem',
  'student_behaviour',
  'inappropriate_behaviour',
  'communication_problem',
  'about_chapter_head',
  'program_organisation',
  'other',
]);

/** Workflow state of a complaint. */
export const complaintStatusEnum = pgEnum('complaint_status', [
  'new',
  'investigating',
  'resolved',
]);

/**
 * The internal communication structures. `group` is the schema-level
 * foundation for each Group's own channel (mentor + that group's active
 * students, with Regional Director oversight) — the messaging/realtime UI
 * itself belongs to the Communication phase, not Phase 2.
 */
export const channelTypeEnum = pgEnum('channel_type', [
  'presidency',
  'chapter_management',
  'chapter_mentors',
  'group',
]);

/** Result of one logical outbound e-mail. */
export const emailStatusEnum = pgEnum('email_status', ['pending', 'sent', 'failed', 'skipped']);

/** Attendance of a mentor at a chapter mentor meeting. */
export const meetingAttendanceEnum = pgEnum('meeting_attendance', ['present', 'absent', 'excused']);

/** Reason a person filled in the public contact form. */
export const contactReasonEnum = pgEnum('contact_reason', [
  'school_representative',
  'mentor_candidate',
  'student',
  'information',
  'other',
]);

/**
 * How a program's sessions are delivered. Nullable at the settings level until
 * an executive configures it — a program's delivery mode is never assumed.
 */
export const deliveryModeEnum = pgEnum('program_delivery_mode', ['online', 'in_person', 'hybrid']);
