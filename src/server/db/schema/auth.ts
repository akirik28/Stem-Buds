import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums';

/**
 * A platform account.
 *
 * Accounts are created only by Executive Management — there is no public
 * self-registration. Only the argon2id hash of a password is ever stored;
 * raw and temporary passwords are never persisted.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Login identity. Stored lower-cased so lookups are case-insensitive. */
    username: varchar('username', { length: 64 }).notNull(),
    fullName: varchar('full_name', { length: 160 }).notNull(),

    /** Optional address used for notification e-mails; never a login identity. */
    notificationEmail: varchar('notification_email', { length: 254 }),

    passwordHash: text('password_hash').notNull(),

    /** True until the user has replaced the temporary password issued to them. */
    mustChangePassword: boolean('must_change_password').notNull().default(true),
    passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),

    role: userRoleEnum('role').notNull(),

    /** Deactivated accounts keep their history but can no longer sign in. */
    isActive: boolean('is_active').notNull().default(true),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),

    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_username_unique').on(sql`lower(${table.username})`),
    index('users_role_idx').on(table.role),
    index('users_is_active_idx').on(table.isActive),
  ],
);

/**
 * Server-side session. The cookie carries only a random opaque identifier and a
 * secret; the secret is stored hashed so a database leak cannot be replayed.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    secretHash: text('secret_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: varchar('user_agent', { length: 300 }),
    ipHash: varchar('ip_hash', { length: 128 }),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * Profile information that is not required to authenticate.
 * Kept separate from `users` so authentication queries stay small.
 */
export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: varchar('phone', { length: 32 }),
  school: varchar('school', { length: 160 }),
  gradeLevel: varchar('grade_level', { length: 32 }),
  notes: text('notes'),
  /** Explicit consent flag required before any student detail may appear publicly. */
  publicationConsent: boolean('publication_consent').notNull().default(false),
  publicationConsentAt: timestamp('publication_consent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.id], references: [profiles.userId] }),
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, { fields: [profiles.userId], references: [users.id] }),
}));
