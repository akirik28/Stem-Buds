import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './auth';
import { academicYears, groups } from './org';
import { milestoneStatusEnum, projectHealthEnum } from './enums';

/**
 * The primary project of a group for one academic year.
 *
 * Deliverable files (PDFs, decks, datasets, video) are deliberately NOT stored
 * or mirrored by the platform — they are shared outside it. Only operational
 * history, a concise result summary, a delivery flag and an optional external
 * reference URL are recorded.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'cascade' }),

    name: varchar('name', { length: 200 }).notNull(),
    shortDescription: text('short_description'),
    researchQuestion: text('research_question'),
    purpose: text('purpose'),

    startDate: date('start_date'),
    /** Latest health value, kept in sync with the newest finalized weekly log. */
    health: projectHealthEnum('health').notNull().default('on_track'),

    outcomeSummary: text('outcome_summary'),
    finalDelivered: boolean('final_delivered').notNull().default(false),
    finalDeliveredAt: timestamp('final_delivered_at', { withTimezone: true }),
    /** Optional external link (Drive, GitHub, ...). Never downloaded or mirrored. */
    externalReferenceUrl: varchar('external_reference_url', { length: 500 }),

    /** Public showcase controls. */
    isPublic: boolean('is_public').notNull().default(false),
    publicSummary: text('public_summary'),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One primary project per group per academic year.
    uniqueIndex('projects_group_year_unique').on(table.groupId, table.academicYearId),
    index('projects_health_idx').on(table.health),
    index('projects_is_public_idx').on(table.isPublic),
  ],
);

export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description'),
    dueDate: date('due_date'),
    status: milestoneStatusEnum('status').notNull().default('planned'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    orderIndex: integer('order_index').notNull().default(0),
    /** Who created it — the "creator can delete their own, unused creation" ownership anchor. */
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('milestones_project_idx').on(table.projectId, table.orderIndex),
    index('milestones_due_date_idx').on(table.dueDate, table.status),
  ],
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  group: one(groups, { fields: [projects.groupId], references: [groups.id] }),
  academicYear: one(academicYears, {
    fields: [projects.academicYearId],
    references: [academicYears.id],
  }),
  milestones: many(milestones),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, { fields: [milestones.projectId], references: [projects.id] }),
}));
