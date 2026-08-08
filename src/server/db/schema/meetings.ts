import { relations } from 'drizzle-orm';
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
import { meetingAttendanceEnum } from './enums';

/** A Chapter Head ↔ mentor meeting for one chapter. */
export const mentorMeetings = pgTable(
  'mentor_meetings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),

    /** Sequence within the chapter/year, e.g. "Mentor Toplantısı #4". */
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
    uniqueIndex('mentor_meetings_chapter_year_sequence_unique').on(
      table.chapterId,
      table.academicYearId,
      table.sequence,
    ),
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
