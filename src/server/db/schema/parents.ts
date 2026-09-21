import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';

/**
 * Which student a parent account may follow.
 *
 * A parent's whole scope is derived from these rows: the groups they can see
 * are the groups their children are in, and nothing else. One parent may
 * follow several children (siblings in the program); one student may have
 * more than one parent account.
 *
 * `monthlyDigestEnabled` lives here rather than on the user, because a
 * parent following two children may want the summary for one and not the
 * other.
 */
export const parentStudentLinks = pgTable(
  'parent_student_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentUserId: uuid('parent_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentUserId: uuid('student_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    monthlyDigestEnabled: boolean('monthly_digest_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('parent_student_links_unique').on(table.parentUserId, table.studentUserId),
    index('parent_student_links_student_idx').on(table.studentUserId),
  ],
);

export const parentStudentLinksRelations = relations(parentStudentLinks, ({ one }) => ({
  parent: one(users, { fields: [parentStudentLinks.parentUserId], references: [users.id] }),
  student: one(users, { fields: [parentStudentLinks.studentUserId], references: [users.id] }),
}));
