import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { academicYears, chapters, groupMemberships, groups } from './org';
import { complaintCategoryEnum, complaintStatusEnum, feedbackCategoryEnum } from './enums';

/** Who is allowed to open a confidential record. */
export const confidentialScopeEnum = pgEnum('confidential_scope', ['chapter', 'executive']);

/**
 * A "Son üç çalışmayı değerlendir" task generated for one student after every
 * three *completed* weekly sessions (not calendar weeks).
 *
 * The unique index on (membership, threshold) makes trigger generation
 * idempotent: re-running the job can never create a second task.
 */
export const feedbackCycles = pgTable(
  'feedback_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupMembershipId: uuid('group_membership_id')
      .notNull()
      .references(() => groupMemberships.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    /** Number of completed sessions that triggered this cycle: 3, 6, 9, ... */
    completedSessionThreshold: integer('completed_session_threshold').notNull(),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('feedback_cycles_membership_threshold_unique').on(
      table.groupMembershipId,
      table.completedSessionThreshold,
    ),
    index('feedback_cycles_pending_idx').on(table.respondedAt),
  ],
);

/**
 * The student's answers for one feedback cycle.
 *
 * `chapterHeadNote` is intentionally never surfaced to mentors; raw responses
 * are readable only by Chapter Head / Executive Management, while mentors see
 * aggregated averages.
 */
export const feedbackResponses = pgTable(
  'feedback_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cycleId: uuid('cycle_id')
      .notNull()
      .references(() => feedbackCycles.id, { onDelete: 'cascade' }),
    /** 1–5: Mentorun yönlendirmesi */
    ratingMentorGuidance: integer('rating_mentor_guidance').notNull(),
    /** 1–5: Çalışmaların verimliliği */
    ratingSessionProductivity: integer('rating_session_productivity').notNull(),
    /** 1–5: Sorularına yeterli destek alabildin mi? */
    ratingSupport: integer('rating_support').notNull(),
    /** 1–5: Grubun ilerlemesinden memnun musun? */
    ratingGroupProgress: integer('rating_group_progress').notNull(),

    mostUseful: text('most_useful'),
    wantChanged: text('want_changed'),
    chapterHeadNote: text('chapter_head_note'),

    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('feedback_responses_cycle_unique').on(table.cycleId)],
);

/**
 * Continuous feedback ("💬 Geri Bildirim Gönder").
 *
 * When submitted anonymously, `reporterUserId` is left NULL so the identity is
 * not recoverable through any ordinary authorized query or export.
 */
export const continuousFeedback = pgTable(
  'continuous_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'set null' }),

    category: feedbackCategoryEnum('category').notNull(),
    message: text('message').notNull(),

    isAnonymous: boolean('is_anonymous').notNull().default(false),
    /** NULL for anonymous submissions — by construction, not by filtering. */
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),

    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('continuous_feedback_chapter_idx').on(table.chapterId, table.createdAt),
    index('continuous_feedback_reviewed_idx').on(table.reviewedAt),
  ],
);

/**
 * A confidential complaint ("⚠️ Şikâyet Bildir").
 *
 * Complaints are a separate object and workflow from feedback. Two privacy
 * invariants are modelled in the data itself:
 *  - anonymous complaints carry no reporter reference at all;
 *  - `targetUserId` is excluded from every access path, and complaints about a
 *    Chapter Head are stored with `scope = 'executive'` so no chapter-level
 *    query can reach them.
 */
export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),

    category: complaintCategoryEnum('category').notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    body: text('body').notNull(),

    isAnonymous: boolean('is_anonymous').notNull().default(false),
    /** NULL for anonymous complaints. */
    reporterUserId: uuid('reporter_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The person the complaint is about, when identified. Always excluded. */
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),

    scope: confidentialScopeEnum('scope').notNull().default('chapter'),
    status: complaintStatusEnum('status').notNull().default('new'),
    assignedToId: uuid('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('complaints_chapter_status_idx').on(table.chapterId, table.status),
    index('complaints_scope_idx').on(table.scope, table.status),
    index('complaints_target_idx').on(table.targetUserId),
  ],
);

export const feedbackCyclesRelations = relations(feedbackCycles, ({ one }) => ({
  membership: one(groupMemberships, {
    fields: [feedbackCycles.groupMembershipId],
    references: [groupMemberships.id],
  }),
  response: one(feedbackResponses, {
    fields: [feedbackCycles.id],
    references: [feedbackResponses.cycleId],
  }),
}));

export const feedbackResponsesRelations = relations(feedbackResponses, ({ one }) => ({
  cycle: one(feedbackCycles, {
    fields: [feedbackResponses.cycleId],
    references: [feedbackCycles.id],
  }),
}));

export const continuousFeedbackRelations = relations(continuousFeedback, ({ one }) => ({
  chapter: one(chapters, { fields: [continuousFeedback.chapterId], references: [chapters.id] }),
  group: one(groups, { fields: [continuousFeedback.groupId], references: [groups.id] }),
}));

export const complaintsRelations = relations(complaints, ({ one }) => ({
  chapter: one(chapters, { fields: [complaints.chapterId], references: [chapters.id] }),
}));
