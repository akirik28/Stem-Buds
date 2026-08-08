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
import { users } from './auth';
import { contactReasonEnum } from './enums';

/**
 * Public "Yönetim Ekibimiz" profile.
 *
 * A profile is published only when a real person has been entered and
 * `isPublic` explicitly set — no placeholder cards are ever rendered.
 */
export const publicLeadershipProfiles = pgTable(
  'public_leadership_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    fullName: varchar('full_name', { length: 160 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    bio: text('bio').notNull(),
    photoMediaId: uuid('photo_media_id'),
    displayOrder: integer('display_order').notNull().default(0),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('public_leadership_order_idx').on(table.isPublic, table.displayOrder)],
);

/** Public news post — a completely separate model from the internal feed. */
export const publicNewsPosts = pgTable(
  'public_news_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: varchar('slug', { length: 200 }).notNull(),
    title: varchar('title', { length: 250 }).notNull(),
    summary: text('summary').notNull(),
    body: text('body').notNull(),
    coverMediaId: uuid('cover_media_id'),
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('public_news_slug_unique').on(table.slug),
    index('public_news_published_idx').on(table.isPublished, table.publishedAt),
  ],
);

/** Image explicitly uploaded for public display by authorized management. */
export const publicMedia = pgTable('public_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  contentType: varchar('content_type', { length: 128 }).notNull(),
  byteSize: integer('byte_size').notNull(),
  storageKey: varchar('storage_key', { length: 400 }).notNull(),
  altText: varchar('alt_text', { length: 300 }).notNull(),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Editable copy blocks for the public homepage highlights. */
export const publicHighlights = pgTable(
  'public_highlights',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 64 }).notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    isPublic: boolean('is_public').notNull().default(true),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('public_highlights_key_unique').on(table.key)],
);

/**
 * Submission from the public contact form.
 * Creating an account from this form is deliberately impossible.
 */
export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: varchar('full_name', { length: 160 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    phone: varchar('phone', { length: 32 }),
    reason: contactReasonEnum('reason').notNull(),
    message: text('message').notNull(),
    /** Hash of the submitting IP, used only for abuse control. */
    ipHash: varchar('ip_hash', { length: 128 }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    handledById: uuid('handled_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('contact_messages_created_idx').on(table.createdAt),
    index('contact_messages_handled_idx').on(table.handledAt),
  ],
);

/** Simple durable rate-limit counters (no external service required). */
export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucketKey: varchar('bucket_key', { length: 200 }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    counter: integer('counter').notNull().default(0),
  },
  (table) => [uniqueIndex('rate_limits_bucket_window_unique').on(table.bucketKey, table.windowStart)],
);
