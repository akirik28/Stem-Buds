import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { academicYears, chapters, groups } from './org';
import { alertSeverityEnum, alertStatusEnum, alertTabEnum, emailStatusEnum } from './enums';

/**
 * Singleton configuration row for the whole program.
 *
 * The weekly working day and time are never hard-coded: until an executive
 * configures them the platform shows "Haftalık çalışma saati henüz belirlenmedi."
 * and no scheduled reminders are sent.
 */
export const programSettings = pgTable('program_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Enforces a single row. */
  singleton: boolean('singleton').notNull().default(true).unique(),

  /** ISO weekday: 1 = Monday ... 7 = Sunday. NULL means "not configured yet". */
  weeklyDayOfWeek: integer('weekly_day_of_week'),
  /** Minutes after local midnight, e.g. 18:30 -> 1110. */
  weeklyStartMinute: integer('weekly_start_minute'),
  weeklyDurationMinutes: integer('weekly_duration_minutes').notNull().default(60),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Istanbul'),

  /** Homework e-mail reminders are configurable and default to OFF. */
  homeworkEmailRemindersEnabled: boolean('homework_email_reminders_enabled')
    .notNull()
    .default(false),

  // --- Alert thresholds (configurable, never scattered as magic constants) ---
  attendanceYellowThreshold: integer('attendance_yellow_threshold').notNull().default(80),
  attendanceRedThreshold: integer('attendance_red_threshold').notNull().default(65),
  consecutiveUnexcusedAbsences: integer('consecutive_unexcused_absences').notNull().default(2),
  homeworkYellowThreshold: integer('homework_yellow_threshold').notNull().default(70),
  homeworkMissedOfLastThree: integer('homework_missed_of_last_three').notNull().default(2),
  incompleteRecordHours: integer('incomplete_record_hours').notNull().default(24),
  feedbackMinimumResponses: integer('feedback_minimum_responses').notNull().default(3),
  /** Stored ×10 to avoid floating point in configuration (3.0 -> 30). */
  feedbackAverageAttentionX10: integer('feedback_average_attention_x10').notNull().default(30),

  configuredAt: timestamp('configured_at', { withTimezone: true }),
  updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Program-wide "Bu hafta çalışma yok / tatil" entries. */
export const programHolidays = pgTable(
  'program_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    /** The local date of the skipped weekly slot. */
    holidayDate: date('holiday_date').notNull(),
    reason: varchar('reason', { length: 200 }).notNull(),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_holidays_year_date_unique').on(table.academicYearId, table.holidayDate),
  ],
);

/**
 * An automatically generated management issue shown in YÖNETİM AKIŞI.
 *
 * `fingerprint` identifies the underlying condition. A partial unique index
 * keeps at most one *open* alert per condition, so repeated evaluation never
 * produces duplicate-alert spam, while resolved history is preserved.
 */
export const managementAlerts = pgTable(
  'management_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fingerprint: varchar('fingerprint', { length: 200 }).notNull(),
    tab: alertTabEnum('tab').notNull(),
    severity: alertSeverityEnum('severity').notNull(),
    status: alertStatusEnum('status').notNull().default('new'),

    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),

    /** Turkish, ready to display. */
    title: varchar('title', { length: 200 }).notNull(),
    detail: text('detail').notNull(),
    /** Structured context (percentages, counts) for the card and for tests. */
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),

    /** True when the engine may close the alert on its own once fixed. */
    autoResolvable: boolean('auto_resolvable').notNull().default(true),
    assignedRoleLabel: varchar('assigned_role_label', { length: 80 }),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),

    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).notNull().defaultNow(),
    lastEvaluatedAt: timestamp('last_evaluated_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('management_alerts_open_fingerprint_unique')
      .on(table.fingerprint)
      .where(sql`status in ('new', 'investigating')`),
    index('management_alerts_tab_status_idx').on(table.tab, table.status),
    index('management_alerts_chapter_idx').on(table.chapterId, table.status),
  ],
);

/** In-app notification. Never carries confidential complaint content. */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body'),
    linkUrl: varchar('link_url', { length: 300 }),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('notifications_user_read_idx').on(table.userId, table.readAt)],
);

/**
 * Delivery log for one logical e-mail.
 *
 * `idempotencyKey` is unique, so a scheduled job that runs twice can never send
 * the same logical message twice.
 */
export const emailLogs = pgTable(
  'email_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
    template: varchar('template', { length: 64 }).notNull(),
    recipientEmail: varchar('recipient_email', { length: 254 }).notNull(),
    recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 300 }).notNull(),
    status: emailStatusEnum('status').notNull().default('pending'),
    /** Safe, non-secret error summary. */
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    relatedEntityType: varchar('related_entity_type', { length: 64 }),
    relatedEntityId: uuid('related_entity_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('email_logs_idempotency_unique').on(table.idempotencyKey),
    index('email_logs_status_idx').on(table.status),
  ],
);

/**
 * Append-only audit trail for sensitive mutations.
 *
 * Passwords, tokens and confidential complaint bodies are never written here.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 160 }).notNull(),
    action: varchar('action', { length: 80 }).notNull(),
    targetType: varchar('target_type', { length: 64 }).notNull(),
    targetId: uuid('target_id'),
    targetLabel: varchar('target_label', { length: 200 }),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'set null' }),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, {
      onDelete: 'set null',
    }),
    beforeData: jsonb('before_data').$type<Record<string, unknown> | null>(),
    afterData: jsonb('after_data').$type<Record<string, unknown> | null>(),
    correlationId: varchar('correlation_id', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_created_idx').on(table.createdAt),
    index('audit_logs_actor_idx').on(table.actorUserId),
    index('audit_logs_target_idx').on(table.targetType, table.targetId),
    index('audit_logs_chapter_idx').on(table.chapterId),
  ],
);

export const managementAlertsRelations = relations(managementAlerts, ({ one }) => ({
  chapter: one(chapters, { fields: [managementAlerts.chapterId], references: [chapters.id] }),
  group: one(groups, { fields: [managementAlerts.groupId], references: [groups.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));
