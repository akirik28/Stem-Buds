import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { academicYears, chapters } from './org';
import { programs } from './programs';
import { meetingAttendanceEnum } from './enums';

/**
 * A meeting is one of three kinds, distinguished by which of
 * `chapterId`/`programId` is set — application code enforces this, not a
 * DB constraint, consistent with this codebase's existing preference for
 * app-level cross-field validation:
 *  - **chapter-scoped** (`chapterId` set, `programId` null) — a Chapter
 *    Head ↔ mentor meeting for that one chapter, the original shape.
 *  - **Program-scoped** (`programId` set, `chapterId` null) — Regional
 *    Director/Vice President meeting with hand-picked participants across
 *    a whole Program, never mixing BİLSEM and Online Ortaokul in the same
 *    meeting.
 *  - **Executive-scoped** (both null) — a Regional Director/Vice
 *    President meeting with the organization's whole Executive Management
 *    team; participants are every current `regional_director`/
 *    `vice_president` account, populated automatically, never hand-picked.
 */
export const mentorMeetings = pgTable(
  'mentor_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),

    /** Sequence within the chapter-or-program/year, e.g. "Mentor Toplantısı #4". */
    sequence: text('sequence').notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),

    agenda: text('agenda'),
    discussionTopics: text('discussion_topics'),
    groupEvaluations: text('group_evaluations'),
    decisions: text('decisions'),
    notes: text('notes'),
    nextMeetingDate: date('next_meeting_date'),

    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('mentor_meetings_chapter_idx').on(table.chapterId, table.startsAt),
    index('mentor_meetings_program_idx').on(table.programId, table.startsAt),
    uniqueIndex('mentor_meetings_chapter_year_sequence_unique').on(
      table.chapterId,
      table.academicYearId,
      table.sequence,
    ),
    // Partial, not a plain (programId, academicYearId, sequence) index:
    // Postgres never treats two NULLs as equal, so a plain index here would
    // silently fail to deduplicate sequence numbers among Program-scoped
    // rows (which all share chapterId = NULL) — the same class of bug fixed
    // in migration 0010 for `channels`.
    uniqueIndex('mentor_meetings_program_year_sequence_unique')
      .on(table.programId, table.academicYearId, table.sequence)
      .where(sql`${table.programId} is not null`),
    // Same NULL-uniqueness reasoning again, this time isolating the third
    // (Executive-scoped) kind: both chapterId and programId are NULL.
    uniqueIndex('mentor_meetings_executive_year_sequence_unique')
      .on(table.academicYearId, table.sequence)
      .where(sql`${table.chapterId} is null and ${table.programId} is null`),
  ],
);

export const mentorMeetingAttendance = pgTable(
  'mentor_meeting_attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => mentorMeetings.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: meetingAttendanceEnum('status').notNull().default('present'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('mentor_meeting_attendance_unique').on(table.meetingId, table.userId)],
);

export const meetingActionItems = pgTable(
  'meeting_action_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => mentorMeetings.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    isCompleted: boolean('is_completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('meeting_action_items_meeting_idx').on(table.meetingId),
    index('meeting_action_items_due_idx').on(table.dueDate, table.isCompleted),
  ],
);

export const mentorMeetingsRelations = relations(mentorMeetings, ({ one, many }) => ({
  chapter: one(chapters, { fields: [mentorMeetings.chapterId], references: [chapters.id] }),
  program: one(programs, { fields: [mentorMeetings.programId], references: [programs.id] }),
  attendance: many(mentorMeetingAttendance),
  actionItems: many(meetingActionItems),
}));

export const mentorMeetingAttendanceRelations = relations(mentorMeetingAttendance, ({ one }) => ({
  meeting: one(mentorMeetings, {
    fields: [mentorMeetingAttendance.meetingId],
    references: [mentorMeetings.id],
  }),
  user: one(users, { fields: [mentorMeetingAttendance.userId], references: [users.id] }),
}));

export const meetingActionItemsRelations = relations(meetingActionItems, ({ one }) => ({
  meeting: one(mentorMeetings, {
    fields: [meetingActionItems.meetingId],
    references: [mentorMeetings.id],
  }),
  owner: one(users, { fields: [meetingActionItems.ownerId], references: [users.id] }),
}));
