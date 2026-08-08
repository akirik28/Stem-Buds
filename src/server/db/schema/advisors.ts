import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { programs } from './programs';

/**
 * Which Program(s) an Advisor Teacher ("Danışman Öğretmen") may observe.
 *
 * This is a read-only observer scope, never a write permission — see
 * `canManageProject`, `canFinalizeWeeklyRecord`, etc. in `authz/policy.ts`,
 * none of which ever grant `advisor_teacher` a true result. A user with a
 * row for every program is an organization-wide advisor; one row is a
 * single-program advisor. The same person can be scoped to more programs
 * later just by inserting another row — no schema change needed.
 */
export const advisorProgramScopes = pgTable(
  'advisor_program_scopes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('advisor_program_scopes_user_program_unique').on(table.userId, table.programId),
    index('advisor_program_scopes_program_idx').on(table.programId),
  ],
);

export const advisorProgramScopesRelations = relations(advisorProgramScopes, ({ one }) => ({
  user: one(users, { fields: [advisorProgramScopes.userId], references: [users.id] }),
  program: one(programs, { fields: [advisorProgramScopes.programId], references: [programs.id] }),
}));
