import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  foreignKey,
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
import { programs } from './programs';
import { groupRoleEnum, userRoleEnum } from './enums';

/**
 * An academic year such as "2026–2027". Exactly one year may be active; older
 * years are never deleted, they stay available as archive/history.
 */
export const academicYears = pgTable(
  'academic_years',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Human label, e.g. "2026–2027". */
    label: varchar('label', { length: 32 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('academic_years_label_unique').on(table.label),
    index('academic_years_is_active_idx').on(table.isActive),
  ],
);

/**
 * A school/chapter, scoped to exactly one program.
 *
 * STEM & BUDS runs two programs (Online Ortaokul Programı, BİLSEM Programı)
 * under one organization. A chapter belongs to one of them — a school that
 * participates in both gets two chapter rows, one per program — so every
 * chapter-scoped concept already in the platform (Chapter Head oversight,
 * groups, weekly sessions, projects, complaints, mentor channels, exports)
 * is automatically program-isolated with no schema change of its own: it
 * inherits `programId` transitively through this column.
 */
export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    /** Short code used throughout the UI, e.g. "UAA". */
    code: varchar('code', { length: 16 }).notNull(),
    name: varchar('name', { length: 160 }).notNull(),
    city: varchar('city', { length: 80 }),
    isActive: boolean('is_active').notNull().default(true),

    /** Public website visibility — only verified chapters may be published. */
    isPublic: boolean('is_public').notNull().default(false),
    publicDescription: text('public_description'),
    publishedAt: timestamp('published_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chapters_code_unique').on(table.code),
    index('chapters_is_public_idx').on(table.isPublic),
    index('chapters_program_idx').on(table.programId),
    // Composite-FK target: lets `groups` (and other program-scoped children)
    // declare a foreign key on (parentId, programId) instead of just
    // (parentId), so Postgres itself rejects a row whose programId doesn't
    // match its parent chapter's — see the `groups` foreign key below.
    uniqueIndex('chapters_id_program_unique').on(table.id, table.programId),
  ],
);

/**
 * Which chapter a user belongs to for a given academic year, and in which role.
 * This is the authorization anchor for chapter-scoped access.
 */
export const chapterMemberships = pgTable(
  'chapter_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'restrict' }),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),
    role: userRoleEnum('role').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chapter_memberships_unique').on(
      table.userId,
      table.chapterId,
      table.academicYearId,
    ),
    index('chapter_memberships_chapter_idx').on(table.chapterId, table.academicYearId),
    index('chapter_memberships_user_idx').on(table.userId),
  ],
);

/**
 * A discipline group such as "Bio 1" or "CS 2" inside a chapter.
 *
 * `programId` is denormalized from the parent chapter (set from it at
 * creation — see `createGroup` in group-service.ts) so program-filtered
 * queries never need to join through `chapters` just to scope by program.
 *
 * That denormalization is not trusted to application code alone: `chapterId`
 * is enforced by a composite foreign key against `chapters (id, program_id)`
 * (declared below) rather than a plain `chapterId -> chapters.id` reference,
 * so the database itself rejects any row where a group's `programId` doesn't
 * match its chapter's — a group can never end up in Program A while its
 * chapter is in Program B, even if a future bug in the service layer tried.
 *
 * `mentorUserId` is the group's single authoritative assigned mentor (one
 * group has exactly one mentor once operational; one mentor may be assigned
 * to several groups). It starts NULL — a group with no mentor yet is a draft
 * and is never treated as operational — and is only ever changed through
 * `assignGroupMentor` in group-service.ts, which also keeps the mirrored
 * `groupMemberships` row (the thing `AccessScope.mentorGroupIds` is actually
 * computed from) and the audit log in sync.
 */
export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    chapterId: uuid('chapter_id').notNull(),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id, { onDelete: 'restrict' }),

    /** Discipline key, e.g. "bio", "chem", "cs", "math", "eng", "social". */
    disciplineKey: varchar('discipline_key', { length: 32 }).notNull(),
    /** Sequence within the discipline in this chapter/year, e.g. 1 for "Bio 1". */
    sequence: integer('sequence').notNull(),
    /** Display name, e.g. "Bio 1". Group codes stay in their canonical form. */
    name: varchar('name', { length: 64 }).notNull(),

    /** NULL = draft (no mentor assigned yet, not operational). */
    mentorUserId: uuid('mentor_user_id').references(() => users.id, { onDelete: 'set null' }),

    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('groups_chapter_year_name_unique').on(
      table.chapterId,
      table.academicYearId,
      table.name,
    ),
    uniqueIndex('groups_chapter_year_discipline_sequence_unique').on(
      table.chapterId,
      table.academicYearId,
      table.disciplineKey,
      table.sequence,
    ),
    index('groups_chapter_idx').on(table.chapterId, table.academicYearId),
    index('groups_program_idx').on(table.programId),
    index('groups_mentor_idx').on(table.mentorUserId),
    // Composite-FK target for `management_alerts.groupId`, mirroring
    // `chapters_id_program_unique` above.
    uniqueIndex('groups_id_program_unique').on(table.id, table.programId),
    foreignKey({
      name: 'groups_chapter_id_program_id_chapters_fk',
      columns: [table.chapterId, table.programId],
      foreignColumns: [chapters.id, chapters.programId],
    }).onDelete('restrict'),
  ],
);

/**
 * Membership of a user in a group.
 *
 * `isTeamLeader` is a group-scoped extra permission for a student, never a
 * global administrator role.
 */
export const groupMemberships = pgTable(
  'group_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: groupRoleEnum('role').notNull(),
    isTeamLeader: boolean('is_team_leader').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('group_memberships_group_user_unique').on(table.groupId, table.userId),
    index('group_memberships_user_idx').on(table.userId),
    index('group_memberships_group_role_idx').on(table.groupId, table.role),
  ],
);

export const academicYearsRelations = relations(academicYears, ({ many }) => ({
  groups: many(groups),
  chapterMemberships: many(chapterMemberships),
}));

export const chaptersRelations = relations(chapters, ({ one, many }) => ({
  program: one(programs, { fields: [chapters.programId], references: [programs.id] }),
  memberships: many(chapterMemberships),
  groups: many(groups),
}));

export const chapterMembershipsRelations = relations(chapterMemberships, ({ one }) => ({
  user: one(users, { fields: [chapterMemberships.userId], references: [users.id] }),
  chapter: one(chapters, { fields: [chapterMemberships.chapterId], references: [chapters.id] }),
  academicYear: one(academicYears, {
    fields: [chapterMemberships.academicYearId],
    references: [academicYears.id],
  }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  program: one(programs, { fields: [groups.programId], references: [programs.id] }),
  chapter: one(chapters, { fields: [groups.chapterId], references: [chapters.id] }),
  academicYear: one(academicYears, {
    fields: [groups.academicYearId],
    references: [academicYears.id],
  }),
  mentor: one(users, { fields: [groups.mentorUserId], references: [users.id] }),
  memberships: many(groupMemberships),
}));

export const groupMembershipsRelations = relations(groupMemberships, ({ one }) => ({
  group: one(groups, { fields: [groupMemberships.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMemberships.userId], references: [users.id] }),
}));
