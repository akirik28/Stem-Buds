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
