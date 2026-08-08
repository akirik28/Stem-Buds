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
import { users } from './auth';
import { chapters, groups } from './org';
import { channelTypeEnum } from './enums';

/**
 * A management communication channel.
 *
 * BAŞKANLIK (executives only), CHAPTER YÖNETİMİ (executives plus every
 * Chapter Head), one mentor channel per chapter, and one channel per Group
 * (its assigned mentor plus that group's active students, with Regional
 * Director oversight). Students are never members of the first three kinds,
 * and student-to-student DMs do not exist anywhere.
 */
export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: channelTypeEnum('type').notNull(),
    /**
     * Set for `chapter_mentors` channels, and also denormalized onto
     * `group` channels from the Group's own chapter (so a chapter-scoped
     * authorization/moderation check never needs an extra join to the
     * `groups` table). Always null for the two org-wide singleton types.
     */
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    /** Set only for `group` channels. */
    groupId: uuid('group_id').references(() => groups.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one presidency channel and one chapter-management channel
    // (both org-wide singletons, chapterId always null on these rows).
    uniqueIndex('channels_org_singleton_unique').on(table.type).where(sql`${table.type} in ('presidency', 'chapter_management')`),
    // At most one mentor channel per chapter. Deliberately scoped to
    // `chapter_mentors` only — a plain unique index on (type, chapterId)
    // would also apply to `group` rows (which denormalize chapterId too),
    // wrongly capping every chapter to a single Group channel.
    uniqueIndex('channels_chapter_mentors_unique').on(table.chapterId).where(sql`${table.type} = 'chapter_mentors'`),
    // At most one channel per group.
    uniqueIndex('channels_type_group_unique').on(table.type, table.groupId),
    index('channels_chapter_idx').on(table.chapterId),
    index('channels_group_idx').on(table.groupId),
  ],
);

export const channelMemberships = pgTable(
  'channel_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /**
     * True when membership comes from system-wide oversight rather than from
     * belonging to the team. Surfaced in the UI — this access is never covert.
     */
    isOversight: boolean('is_oversight').notNull().default(false),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('channel_memberships_channel_user_unique').on(table.channelId, table.userId),
    index('channel_memberships_user_idx').on(table.userId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    /** System messages (e.g. "📅 Yeni Mentor Toplantısı") have no author. */
    isSystem: boolean('is_system').notNull().default(false),
    body: text('body').notNull(),
    parentMessageId: uuid('parent_message_id'),
    isAnnouncement: boolean('is_announcement').notNull().default(false),
    isPinned: boolean('is_pinned').notNull().default(false),
    pinnedAt: timestamp('pinned_at', { withTimezone: true }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('messages_channel_created_idx').on(table.channelId, table.createdAt),
    index('messages_parent_idx').on(table.parentMessageId),
    index('messages_pinned_idx').on(table.channelId, table.isPinned),
  ],
);

export const messageMentions = pgTable(
  'message_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('message_mentions_unique').on(table.messageId, table.userId),
    index('message_mentions_user_idx').on(table.userId),
  ],
);

/**
 * Attachment metadata. Files live in private storage and are only reachable
 * through an authorized download route — never through a public URL.
 */
export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    contentType: varchar('content_type', { length: 128 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    /** Path relative to UPLOAD_DIR. Never exposed to the client. */
    storageKey: varchar('storage_key', { length: 400 }).notNull(),
    isImage: boolean('is_image').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('message_attachments_message_idx').on(table.messageId)],
);

export const channelsRelations = relations(channels, ({ one, many }) => ({
  chapter: one(chapters, { fields: [channels.chapterId], references: [chapters.id] }),
  group: one(groups, { fields: [channels.groupId], references: [groups.id] }),
  memberships: many(channelMemberships),
  messages: many(messages),
}));

export const channelMembershipsRelations = relations(channelMemberships, ({ one }) => ({
  channel: one(channels, { fields: [channelMemberships.channelId], references: [channels.id] }),
  user: one(users, { fields: [channelMemberships.userId], references: [users.id] }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, { fields: [messages.channelId], references: [channels.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  attachments: many(messageAttachments),
  mentions: many(messageMentions),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, { fields: [messageAttachments.messageId], references: [messages.id] }),
}));
