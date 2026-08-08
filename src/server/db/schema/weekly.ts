import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { academicYears, groupMemberships, groups } from './org';
import {
  attendanceStatusEnum,
  homeworkStatusEnum,
  projectHealthEnum,
  weeklySessionStateEnum,
} from './enums';

/**
 * One weekly one-hour working slot for one group.
 *
 * Sessions are generated from the global program schedule. Generation is
 * idempotent: the unique index on (group, scheduled start) makes a repeated run
 * a no-op instead of a duplicate.
 */
export const weeklySessions = pgTable(
  'weekly_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),

    /** 1-based week index inside the academic year. */
    weekNumber: integer('week_number').notNull(),
    scheduledStartAt: timestamp('scheduled_start_at', { withTimezone: true }).notNull(),
    scheduledEndAt: timestamp('scheduled_end_at', { withTimezone: true }).notNull(),

    state: weeklySessionStateEnum('state').notNull().default('scheduled'),
    cancellationReason: text('cancellation_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('weekly_sessions_group_start_unique').on(table.groupId, table.scheduledStartAt),
    uniqueIndex('weekly_sessions_group_year_week_unique').on(
      table.groupId,
      table.academicYearId,
      table.weekNumber,
    ),
    index('weekly_sessions_start_idx').on(table.scheduledStartAt),
    index('weekly_sessions_year_idx').on(table.academicYearId),
  ],
);

/**
 * The weekly work record ("Haftalık Çalışma Kaydı") of one session.
 *
 * A Team Leader may draft the narrative and next-week goal; the mentor remains
 * the authority for attendance finalization, homework results and approval.
 * `completedAt` is written only by the server after every requirement is met.
 */
export const weeklyWorkLogs = pgTable(
  'weekly_work_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weeklySessionId: uuid('weekly_session_id')
      .notNull()
      .references(() => weeklySessions.id, { onDelete: 'cascade' }),

    /** "Bu hafta projede ne yaptınız?" — required before completion. */
    whatWeDid: text('what_we_did'),
    /** "Bu hafta çıkan sonuç/çıktılar" — optional. */
    outputs: text('outputs'),
    /** "Karşılaşılan problem" — optional. */
    problems: text('problems'),
    /** "Gelecek hafta hedefiniz" — required before completion. */
    nextWeekGoal: text('next_week_goal'),
    /** "Proje durumu" — required before completion. */
    projectHealth: projectHealthEnum('project_health'),

    /** Team Leader draft bookkeeping. */
    draftAuthorId: uuid('draft_author_id').references(() => users.id, { onDelete: 'set null' }),
    draftSubmittedAt: timestamp('draft_submitted_at', { withTimezone: true }),

    attendanceFinalizedAt: timestamp('attendance_finalized_at', { withTimezone: true }),
    attendanceFinalizedById: uuid('attendance_finalized_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** Set when the results of the *previous* week's homework have been marked. */
    previousHomeworkFinalizedAt: timestamp('previous_homework_finalized_at', {
      withTimezone: true,
    }),

    mentorApprovedAt: timestamp('mentor_approved_at', { withTimezone: true }),
    mentorApprovedById: uuid('mentor_approved_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /** Server-computed. Never written from client input. */
    completedAt: timestamp('completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('weekly_work_logs_session_unique').on(table.weeklySessionId),
    index('weekly_work_logs_completed_idx').on(table.completedAt),
  ],
);

/** Official attendance of one student in one weekly session. */
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weeklySessionId: uuid('weekly_session_id')
      .notNull()
      .references(() => weeklySessions.id, { onDelete: 'cascade' }),
    groupMembershipId: uuid('group_membership_id')
      .notNull()
      .references(() => groupMemberships.id, { onDelete: 'cascade' }),
    status: attendanceStatusEnum('status').notNull(),
    note: text('note'),
    recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('attendance_records_session_membership_unique').on(
      table.weeklySessionId,
      table.groupMembershipId,
    ),
    index('attendance_records_membership_idx').on(table.groupMembershipId),
    index('attendance_records_status_idx').on(table.status),
  ],
);

/**
 * Homework decided at the end of a weekly session.
 *
 * Either a description exists, or "Bu hafta ödev yok." was explicitly chosen —
 * enforced by a database check constraint, not by frontend validation.
 */
export const homeworkAssignments = pgTable(
  'homework_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    weeklySessionId: uuid('weekly_session_id')
      .notNull()
      .references(() => weeklySessions.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),

    noHomework: boolean('no_homework').notNull().default(false),
    description: text('description'),
    dueDate: date('due_date'),
    /** The session at which results are marked; defaults to the next session. */
    dueSessionId: uuid('due_session_id').references(() => weeklySessions.id, {
      onDelete: 'set null',
    }),

    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    resultsFinalizedAt: timestamp('results_finalized_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('homework_assignments_session_unique').on(table.weeklySessionId),
    index('homework_assignments_group_idx').on(table.groupId),
    index('homework_assignments_due_session_idx').on(table.dueSessionId),
    check(
      'homework_assignments_description_or_none',
      sql`(${table.noHomework} = true AND ${table.description} IS NULL)
          OR (${table.noHomework} = false AND ${table.description} IS NOT NULL
              AND length(btrim(${table.description})) > 0)`,
    ),
  ],
);

/** Official per-student result of one homework assignment. */
export const homeworkStudentStatuses = pgTable(
  'homework_student_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => homeworkAssignments.id, { onDelete: 'cascade' }),
    groupMembershipId: uuid('group_membership_id')
      .notNull()
      .references(() => groupMemberships.id, { onDelete: 'cascade' }),
    status: homeworkStatusEnum('status').notNull().default('pending'),
    note: text('note'),
    markedById: uuid('marked_by_id').references(() => users.id, { onDelete: 'set null' }),
    markedAt: timestamp('marked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('homework_student_statuses_assignment_membership_unique').on(
      table.assignmentId,
      table.groupMembershipId,
    ),
    index('homework_student_statuses_membership_idx').on(table.groupMembershipId),
    index('homework_student_statuses_status_idx').on(table.status),
  ],
);

export const weeklySessionsRelations = relations(weeklySessions, ({ one, many }) => ({
  group: one(groups, { fields: [weeklySessions.groupId], references: [groups.id] }),
  academicYear: one(academicYears, {
    fields: [weeklySessions.academicYearId],
    references: [academicYears.id],
  }),
  workLog: one(weeklyWorkLogs, {
    fields: [weeklySessions.id],
    references: [weeklyWorkLogs.weeklySessionId],
  }),
  attendance: many(attendanceRecords),
}));

export const weeklyWorkLogsRelations = relations(weeklyWorkLogs, ({ one }) => ({
  session: one(weeklySessions, {
    fields: [weeklyWorkLogs.weeklySessionId],
    references: [weeklySessions.id],
  }),
}));

export const attendanceRecordsRelations = relations(attendanceRecords, ({ one }) => ({
  session: one(weeklySessions, {
    fields: [attendanceRecords.weeklySessionId],
    references: [weeklySessions.id],
  }),
  membership: one(groupMemberships, {
    fields: [attendanceRecords.groupMembershipId],
    references: [groupMemberships.id],
  }),
}));

export const homeworkAssignmentsRelations = relations(homeworkAssignments, ({ one, many }) => ({
  session: one(weeklySessions, {
    fields: [homeworkAssignments.weeklySessionId],
    references: [weeklySessions.id],
  }),
  group: one(groups, { fields: [homeworkAssignments.groupId], references: [groups.id] }),
  statuses: many(homeworkStudentStatuses),
}));

export const homeworkStudentStatusesRelations = relations(homeworkStudentStatuses, ({ one }) => ({
  assignment: one(homeworkAssignments, {
    fields: [homeworkStudentStatuses.assignmentId],
    references: [homeworkAssignments.id],
  }),
  membership: one(groupMemberships, {
    fields: [homeworkStudentStatuses.groupMembershipId],
    references: [groupMemberships.id],
  }),
}));
