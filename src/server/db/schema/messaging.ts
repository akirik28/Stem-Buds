import { relations } from 'drizzle-orm';
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
import { chapters } from './org';
import { channelTypeEnum } from './enums';

/**
 * A management communication channel.
 *
 * Three kinds exist: BAŞKANLIK (executives only), CHAPTER YÖNETİMİ (executives
 * plus every Chapter Head) and one mentor channel per chapter. Students are
 * never members of any of them, and student-to-student DMs do not exist.
 */
export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: channelTypeEnum('type').notNull(),
    /** Set only for `chapter_mentors` channels. */
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // At most one presidency channel and one chapter-management channel;
    // at most one mentor channel per chapter.
    uniqueIndex('channels_type_chapter_unique').on(table.type, table.chapterId),
    index('channels_chapter_idx').on(table.chapterId),
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
