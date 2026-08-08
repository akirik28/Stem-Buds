import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { deliveryModeEnum } from './enums';

/**
 * STEM & BUDS runs two distinct programs under one organization: the Online
 * Ortaokul Programı (existing weekly-Zoom / 10-week model) and the BİLSEM
 * Programı (its own lifecycle, ending in a final conference). They share
 * users, authentication, administration and the visual identity, but their
 * operational shape can differ — so every configurable assumption about how a
 * program runs lives on `programSettings`, one row per program, not on this
 * table or hard-coded in application logic.
 *
 * `key` is a stable code the application refers to (`PROGRAM_KEYS` in
 * `src/server/domain/program.ts`); `name`/`shortName` are the Turkish labels
 * shown in the UI's "Tüm Programlar / Online Ortaokul Programı / BİLSEM
 * Programı" switcher.
 *
 * Every chapter belongs to exactly one program (`chapters.programId` in
 * `org.ts`), and that is what actually isolates the two programs' data —
 * groups, weekly sessions, projects, complaints, mentor channels and exports
 * all inherit the scope transitively through their chapter/group, with no
 * schema change of their own.
 */
export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 40 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    shortName: varchar('short_name', { length: 60 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('programs_key_unique').on(table.key)],
);

/**
 * Per-program configuration.
 *
 * One row per program, not a global singleton: the Online Ortaokul
 * Programı's weekly Zoom slot and 10-week cycle must never leak into the
 * BİLSEM Programı's row as a default. Every field starts unset — the product
 * shows "Haftalık çalışma saati henüz belirlenmedi." per program until an
 * executive configures that specific program, the same empty-state contract
 * Phase 1 established, just no longer assumed to be organization-wide.
 */
export const programSettings = pgTable('program_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  programId: uuid('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'cascade' })
    .unique(),

  deliveryMode: deliveryModeEnum('delivery_mode'),
  /** e.g. 10 for the Online Ortaokul Programı's 10-week cycle; null until set. */
  cycleLengthWeeks: integer('cycle_length_weeks'),

  /** ISO weekday: 1 = Monday ... 7 = Sunday. NULL means "not configured yet". */
  weeklyDayOfWeek: integer('weekly_day_of_week'),
  /** Minutes after local midnight, e.g. 18:30 -> 1110. */
  weeklyStartMinute: integer('weekly_start_minute'),
  weeklyDurationMinutes: integer('weekly_duration_minutes'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Europe/Istanbul'),

  /** Homework e-mail reminders are configurable and default to OFF. */
  homeworkEmailRemindersEnabled: boolean('homework_email_reminders_enabled')
    .notNull()
    .default(false),

  // --- Alert thresholds (configurable per program, never a shared magic constant) ---
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

export const programsRelations = relations(programs, ({ one }) => ({
  settings: one(programSettings, {
    fields: [programs.id],
    references: [programSettings.programId],
  }),
}));

export const programSettingsRelations = relations(programSettings, ({ one }) => ({
  program: one(programs, { fields: [programSettings.programId], references: [programs.id] }),
}));

// The relation from `programs` to `chapters`/`programHolidays` is declared on
// those tables themselves (`org.ts`, `ops.ts`) to avoid a circular import
// back into this file — see each table's own `relations()` block.
