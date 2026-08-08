import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
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
import { programs } from './programs';
import {
  aiInsightTypeEnum,
  aiScopeTypeEnum,
  alertCategoryEnum,
  alertSeverityEnum,
  alertStatusEnum,
  alertTabEnum,
  emailStatusEnum,
} from './enums';

/** Program-wide "Bu hafta çalışma yok / tatil" entries, scoped per program. */
export const programHolidays = pgTable(
  'program_holidays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
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
    uniqueIndex('program_holidays_program_year_date_unique').on(
      table.programId,
      table.academicYearId,
      table.holidayDate,
    ),
    index('program_holidays_program_idx').on(table.programId),
  ],
);

/**
 * An automatically generated management issue shown in YÖNETİM AKIŞI.
 *
 * `fingerprint` identifies the underlying condition. A partial unique index
 * keeps at most one *open* alert per condition, so repeated evaluation never
 * produces duplicate-alert spam, while resolved history is preserved.
 *
 * `programId` is denormalized from the alert's chapter/group (both of which
 * already carry it) purely so the "Tüm Programlar / Online Ortaokul Programı /
 * BİLSEM Programı" switcher can filter this dashboard-critical, high-read
 * table with a plain equality check instead of a join. Like `groups`, that
 * denormalization is enforced by the database itself: `chapterId`/`groupId`
 * are composite foreign keys against `(id, program_id)` on their respective
 * tables (declared below), not plain single-column references, so an alert
 * can never be tagged with a `programId` that disagrees with the chapter or
 * group it is actually about.
 */
export const managementAlerts = pgTable(
  'management_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fingerprint: varchar('fingerprint', { length: 200 }).notNull(),
    tab: alertTabEnum('tab').notNull(),
    category: alertCategoryEnum('category').notNull(),
    severity: alertSeverityEnum('severity').notNull(),
    status: alertStatusEnum('status').notNull().default('new'),

    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id'),
    groupId: uuid('group_id'),

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
    index('management_alerts_category_status_idx').on(table.category, table.status),
    index('management_alerts_chapter_idx').on(table.chapterId, table.status),
    index('management_alerts_program_idx').on(table.programId, table.status),
    // Composite FKs (not plain single-column references): Postgres only
    // enforces these when the referencing column is non-null (its default
    // MATCH SIMPLE behavior), so a chapter-less/group-less alert is
    // unaffected — but whenever chapterId/groupId *is* set, its programId is
    // now guaranteed to match.
    foreignKey({
      name: 'management_alerts_chapter_id_program_id_chapters_fk',
      columns: [table.chapterId, table.programId],
      foreignColumns: [chapters.id, chapters.programId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'management_alerts_group_id_program_id_groups_fk',
      columns: [table.groupId, table.programId],
      foreignColumns: [groups.id, groups.programId],
    }).onDelete('cascade'),
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

/**
 * Cached result of one bounded Phase 5 AI surface (see `authz/ai.ts` for the
 * five allowed `insightType`s). This is a cache, not a source of truth: the
 * facts it summarizes are always computed deterministically first and the
 * caller is always re-authorized for `scopeType`/`scopeId`/`programId`
 * before a cache hit is ever returned — a row existing here is never itself
 * treated as proof that the current caller may read it.
 *
 * `contextHash` changes whenever the underlying deterministic facts change,
 * so a new row is written instead of silently reusing stale content; old
 * rows are harmless generated history, not alert state, and are never
 * required to be deleted.
 */
export const aiInsights = pgTable(
  'ai_insights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    insightType: aiInsightTypeEnum('insight_type').notNull(),
    scopeType: aiScopeTypeEnum('scope_type').notNull(),
    /** Null only for `scopeType = 'organization'`. */
    scopeId: uuid('scope_id'),
    /** Null only for an organization-wide, all-Programs Executive view. */
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    /** ISO week key such as "2026-W32"; only meaningful for periodic insights. */
    periodKey: varchar('period_key', { length: 16 }),
    /** sha256 of the exact structured facts object sent to the model. */
    contextHash: varchar('context_hash', { length: 64 }).notNull(),

    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    provider: varchar('provider', { length: 32 }).notNull(),
    model: varchar('model', { length: 64 }).notNull(),

    generatedByUserId: uuid('generated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_insights_identity_unique').on(
      table.insightType,
      table.scopeType,
      table.scopeId,
      table.programId,
      table.periodKey,
      table.contextHash,
    ),
    index('ai_insights_lookup_idx').on(table.insightType, table.scopeType, table.scopeId),
  ],
);

export const managementAlertsRelations = relations(managementAlerts, ({ one }) => ({
  program: one(programs, { fields: [managementAlerts.programId], references: [programs.id] }),
  chapter: one(chapters, { fields: [managementAlerts.chapterId], references: [chapters.id] }),
  group: one(groups, { fields: [managementAlerts.groupId], references: [groups.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));

export const aiInsightsRelations = relations(aiInsights, ({ one }) => ({
  program: one(programs, { fields: [aiInsights.programId], references: [programs.id] }),
  generatedBy: one(users, { fields: [aiInsights.generatedByUserId], references: [users.id] }),
}));
