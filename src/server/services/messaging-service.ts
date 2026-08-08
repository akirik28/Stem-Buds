import { and, asc, desc, eq, gt, inArray, isNull, lt, sql, type SQL } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { chapterMemberships, chapters, channelMemberships, channels, groupMemberships, groups, messageMentions, messages, users } from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import {
  canAccessChannel,
  isChapterHead,
  isExecutive,
  isOversightMembership,
  type AccessScope,
  type ChannelAccessInput,
} from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * Management + Group communication (Section: Communication phase). Every
 * read/write here is gated by the existing pure `canAccessChannel` — see its
 * own doc comment for the exact membership rules, most notably that an
 * Advisor Teacher is hard-blocked from every channel unconditionally.
 *
 * `channelMemberships` is deliberately never the authorization source: it
 * only tracks `lastReadAt` (and the display-only `isOversight` flag) and is
 * upserted lazily whenever a user actually opens a channel, so it can never
 * drift out of sync with live chapter/group membership the way a
 * separately-maintained ACL table could.
 */

export type Channel = typeof channels.$inferSelect;
export type Message = typeof messages.$inferSelect;

function toAccessInput(channel: Channel): ChannelAccessInput {
  return { type: channel.type, chapterId: channel.chapterId, groupId: channel.groupId };
}

// ---------------------------------------------------------------------------
// Channel provisioning — idempotent, safe to call on every read
// ---------------------------------------------------------------------------

/**
 * Ensures the org-wide singleton channels (presidency, chapter management)
 * exist. A plain unique index on `(type, chapterId)` could not do this
 * job — Postgres never treats two `NULL`s as equal for unique-index
 * purposes, so it would never have rejected a second `chapterId IS NULL`
 * row of the same type. Migration `0010` replaced it with
 * `channels_org_singleton_unique`, a partial unique index on `(type)
 * WHERE type IN ('presidency', 'chapter_management')`. The `where` clause
 * here must name that exact predicate so Postgres can use the partial
 * index as the `ON CONFLICT` arbiter — this makes the insert atomic and
 * safe under concurrent first-ever calls, unlike a check-then-insert.
 */
export async function ensureOrgChannels(db: Database = getDb()): Promise<void> {
  const singletons: Array<{ type: 'presidency' | 'chapter_management'; name: string }> = [
    { type: 'presidency', name: 'Başkanlık' },
    { type: 'chapter_management', name: 'Chapter Yönetimi' },
  ];
  for (const singleton of singletons) {
    await db
      .insert(channels)
      .values({ type: singleton.type, name: singleton.name, chapterId: null, groupId: null })
      .onConflictDoNothing({
        target: channels.type,
        where: sql`${channels.type} in ('presidency', 'chapter_management')`,
      });
  }
}

/**
 * `channels_chapter_mentors_unique` (migration `0010`) is a partial unique
 * index on `(chapter_id) WHERE type = 'chapter_mentors'` — it does not
 * cover `group` channels, which also carry `chapter_id` but must allow many
 * rows per chapter (one per Group). The `where` clause below must match
 * that exact predicate for Postgres to recognize this as the same partial
 * index and use it as the `ON CONFLICT` arbiter.
 */
export async function ensureChapterMentorChannel(chapterId: string, db: Database = getDb()): Promise<void> {
  const [chapter] = await db.select({ name: chapters.name }).from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  if (!chapter) return;
  await db
    .insert(channels)
    .values({ type: 'chapter_mentors', chapterId, groupId: null, name: `${chapter.name} — Mentor Ekibi` })
    .onConflictDoNothing({
      target: channels.chapterId,
      where: sql`${channels.type} = 'chapter_mentors'`,
    });
}

export async function ensureGroupChannel(groupId: string, db: Database = getDb()): Promise<void> {
  const [group] = await db.select({ name: groups.name, chapterId: groups.chapterId }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return;
  await db
    .insert(channels)
    .values({ type: 'group', chapterId: group.chapterId, groupId, name: group.name })
    .onConflictDoNothing({ target: [channels.type, channels.groupId] });
}

/**
 * Provisions every channel that could ever exist, regardless of who's
 * asking. `canAccessChannel` grants Chapter Head/Executive broad,
 * role-based access that has nothing to do with their own personal
 * chapter/group membership rows (e.g. an Executive belongs to no chapter or
 * Group at all, yet must see every `chapter_mentors`/`group` channel) — so
 * provisioning scoped only to the *viewer's own* memberships would leave
 * those channels never created for exactly the roles most likely to open
 * them first. All four `ensure*` calls are idempotent, and this app's
 * chapter/group count is small enough that doing this on every read is
 * cheap.
 */
async function ensureAllChannelsProvisioned(db: Database): Promise<void> {
  await ensureOrgChannels(db);
  const allChapterIds = (await db.select({ id: chapters.id }).from(chapters)).map((c) => c.id);
  for (const chapterId of allChapterIds) await ensureChapterMentorChannel(chapterId, db);
  const allGroupIds = (await db.select({ id: groups.id }).from(groups)).map((g) => g.id);
  for (const groupId of allGroupIds) await ensureGroupChannel(groupId, db);
}

// ---------------------------------------------------------------------------
// Listing channels + messages
// ---------------------------------------------------------------------------

export type ChannelWithUnread = Channel & { unreadCount: number; lastMessageAt: Date | null };

/**
 * Every channel the caller may access, provisioning any that don't exist yet
 * (a chapter/group created before this phase shipped, or before it had any
 * mentors/students, never blocks messaging once the prerequisite exists).
 */
export async function listChannelsForViewer(scope: AccessScope): Promise<ChannelWithUnread[]> {
  const db = getDb();
  await ensureAllChannelsProvisioned(db);

  const allChannels = await db.select().from(channels);
  const accessible = allChannels.filter((c) => canAccessChannel(scope, toAccessInput(c)));
  if (accessible.length === 0) return [];

  const channelIds = accessible.map((c) => c.id);
  const readRows = await db
    .select({ channelId: channelMemberships.channelId, lastReadAt: channelMemberships.lastReadAt })
    .from(channelMemberships)
    .where(and(inArray(channelMemberships.channelId, channelIds), eq(channelMemberships.userId, scope.userId)));
  const lastReadByChannel = new Map(readRows.map((r) => [r.channelId, r.lastReadAt]));

  const results: ChannelWithUnread[] = [];
  for (const channel of accessible) {
    const lastReadAt = lastReadByChannel.get(channel.id) ?? null;
    const conditions: SQL[] = [eq(messages.channelId, channel.id), isNull(messages.deletedAt)];
    const [lastMessage] = await db.select({ createdAt: messages.createdAt }).from(messages).where(and(...conditions)).orderBy(desc(messages.createdAt)).limit(1);
    const unreadCount = await countUnread(channel.id, lastReadAt, db);
    results.push({ ...channel, unreadCount, lastMessageAt: lastMessage?.createdAt ?? null });
  }

  return results.sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0));
}

async function countUnread(channelId: string, lastReadAt: Date | null, db: Database): Promise<number> {
  const conditions: SQL[] = [eq(messages.channelId, channelId), isNull(messages.deletedAt)];
  if (lastReadAt) conditions.push(gt(messages.createdAt, lastReadAt));
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(messages).where(and(...conditions));
  return row?.count ?? 0;
}

export async function getChannelForViewer(scope: AccessScope, channelId: string): Promise<Channel | null> {
  const [channel] = await getDb().select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel || !canAccessChannel(scope, toAccessInput(channel))) return null;
  return channel;
}

export type MessageWithAuthor = Message & { authorName: string | null; authorUsername: string | null; isOversightAuthor: boolean };

/**
 * Most-recent-first page of a channel's messages. `before` (a message id)
 * paginates backward in time — the composer/thread view always starts at
 * the newest message and loads older ones on demand.
 */
export async function listChannelMessages(
  scope: AccessScope,
  channelId: string,
  options: { before?: string; limit?: number } = {},
): Promise<MessageWithAuthor[]> {
  const channel = await getChannelForViewer(scope, channelId);
  if (!channel) return [];
  const db = getDb();

  const conditions: SQL[] = [eq(messages.channelId, channelId), isNull(messages.deletedAt)];
  if (options.before) {
    const [beforeMessage] = await db.select({ createdAt: messages.createdAt }).from(messages).where(eq(messages.id, options.before)).limit(1);
    if (beforeMessage) conditions.push(lt(messages.createdAt, beforeMessage.createdAt));
  }

  const rows = await db
    .select({ message: messages, authorName: users.fullName, authorUsername: users.username, authorRole: users.role })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(and(...conditions))
    .orderBy(desc(messages.createdAt))
    .limit(Math.min(options.limit ?? 50, 100));

  return rows
    .map((r) => ({
      ...r.message,
      authorName: r.authorName,
      authorUsername: r.authorUsername,
      isOversightAuthor: isOversightAuthorRole(r.authorRole, channel.type),
    }))
    .reverse();
}

/** Messages strictly newer than `sinceMessageCreatedAt` — the polling endpoint behind near-realtime delivery. */
export async function listNewChannelMessages(scope: AccessScope, channelId: string, sinceCreatedAt: Date): Promise<MessageWithAuthor[]> {
  const channel = await getChannelForViewer(scope, channelId);
  if (!channel) return [];
  const db = getDb();

  const rows = await db
    .select({ message: messages, authorName: users.fullName, authorUsername: users.username, authorRole: users.role })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorId))
    .where(and(eq(messages.channelId, channelId), isNull(messages.deletedAt), gt(messages.createdAt, sinceCreatedAt)))
    .orderBy(asc(messages.createdAt))
    .limit(100);

  return rows.map((r) => ({
    ...r.message,
    authorName: r.authorName,
    authorUsername: r.authorUsername,
    isOversightAuthor: isOversightAuthorRole(r.authorRole, channel.type),
  }));
}

/** Mirrors `isOversightMembership`'s rule, applied to a message's author rather than the current viewer. */
function isOversightAuthorRole(role: (typeof users.$inferSelect)['role'] | null, channelType: Channel['type']): boolean {
  if (role !== 'regional_director' && role !== 'vice_president') return false;
  return channelType === 'chapter_mentors' || channelType === 'group';
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 4000;

export async function postMessage(input: {
  scope: AccessScope;
  channelId: string;
  body: string;
  parentMessageId?: string | null;
  isAnnouncement?: boolean;
  actor: { id: string | null; name: string };
}): Promise<Message> {
  const channel = await getChannelForViewer(input.scope, input.channelId);
  if (!channel) throw validationError('Bu kanala erişiminiz yok.');
  if (!input.actor.id) throw validationError('Geçersiz kullanıcı.');

  const body = input.body.trim();
  if (body.length === 0) throw validationError('Mesaj boş olamaz.');
  if (body.length > MAX_MESSAGE_LENGTH) throw validationError('Mesaj çok uzun.');

  const isAnnouncement = Boolean(input.isAnnouncement);
  if (isAnnouncement && !isExecutive(input.scope.role) && !isChapterHead(input.scope.role)) {
    throw validationError('Yalnızca Chapter Head veya üst yönetim duyuru yapabilir.');
  }

  const db = getDb();
  if (input.parentMessageId) {
    const [parent] = await db.select({ channelId: messages.channelId }).from(messages).where(eq(messages.id, input.parentMessageId)).limit(1);
    if (!parent || parent.channelId !== input.channelId) throw validationError('Geçersiz yanıt hedefi.');
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        channelId: input.channelId,
        authorId: input.actor.id,
        body,
        parentMessageId: input.parentMessageId ?? null,
        isAnnouncement,
      })
      .returning();
    if (!row) throw notFound('Mesaj oluşturulamadı.');

    await touchLastRead(input.scope.userId, input.channelId, input.scope, tx);
    await recordMentions(row.id, body, input.channelId, tx);

    return row;
  });
}

async function recordMentions(messageId: string, body: string, channelId: string, tx: Database): Promise<void> {
  // Usernames are always stored already-lowercased (see `normalizeUsername`)
  // and constrained to plain ASCII, so a plain `.toLowerCase()` match here
  // is exactly consistent with how they were normalized at creation.
  const usernames = [...new Set([...body.matchAll(/@([a-z0-9._-]{3,64})/gi)].map((m) => m[1]!.toLowerCase()))];
  if (usernames.length === 0) return;

  const candidates = await tx.select({ id: users.id, username: users.username }).from(users).where(inArray(users.username, usernames));
  if (candidates.length === 0) return;

  // Only mention someone who could actually read this channel — mirrors the
  // same "compute from live scope" rule as everything else in this file, so
  // a mention can never leak into an unauthorized inbox notification.
  const memberIds = await resolveChannelMemberIds(channelId, tx);
  const mentioned = candidates.filter((c) => memberIds.has(c.id));
  if (mentioned.length === 0) return;

  await tx
    .insert(messageMentions)
    .values(mentioned.map((c) => ({ messageId, userId: c.id })))
    .onConflictDoNothing({ target: [messageMentions.messageId, messageMentions.userId] });
}

/** Every real user id who could access this channel — used only for mention resolution, never for authorization decisions. */
async function resolveChannelMemberIds(channelId: string, db: Database): Promise<Set<string>> {
  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) return new Set();

  const ids = new Set<string>();
  const execs = await db.select({ id: users.id }).from(users).where(inArray(users.role, ['regional_director', 'vice_president']));
  execs.forEach((u) => ids.add(u.id));

  if (channel.type === 'chapter_management') {
    const heads = await db.select({ id: chapterMemberships.userId }).from(chapterMemberships).where(and(eq(chapterMemberships.role, 'chapter_head'), eq(chapterMemberships.isActive, true)));
    heads.forEach((h) => ids.add(h.id));
  } else if (channel.type === 'chapter_mentors' && channel.chapterId) {
    const members = await db
      .select({ id: chapterMemberships.userId })
      .from(chapterMemberships)
      .where(and(eq(chapterMemberships.chapterId, channel.chapterId), inArray(chapterMemberships.role, ['chapter_head', 'mentor']), eq(chapterMemberships.isActive, true)));
    members.forEach((m) => ids.add(m.id));
  } else if (channel.type === 'group' && channel.groupId) {
    const members = await db.select({ id: groupMemberships.userId }).from(groupMemberships).where(and(eq(groupMemberships.groupId, channel.groupId), eq(groupMemberships.isActive, true)));
    members.forEach((m) => ids.add(m.id));
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Read tracking
// ---------------------------------------------------------------------------

async function touchLastRead(userId: string, channelId: string, scope: AccessScope, db: Database): Promise<void> {
  const channelRow = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  const channel = channelRow[0];
  const oversight = channel ? isOversightMembership(scope, toAccessInput(channel)) : false;

  await db
    .insert(channelMemberships)
    .values({ channelId, userId, isOversight: oversight, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [channelMemberships.channelId, channelMemberships.userId],
      set: { lastReadAt: new Date() },
    });
}

export async function markChannelRead(scope: AccessScope, channelId: string): Promise<void> {
  const channel = await getChannelForViewer(scope, channelId);
  if (!channel) throw validationError('Bu kanala erişiminiz yok.');
  await touchLastRead(scope.userId, channelId, scope, getDb());
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

/** Exported so the UI's pin/delete controls render exactly when the mutating action would actually succeed. */
export function canModerateChannel(scope: AccessScope, channel: Channel): boolean {
  if (isExecutive(scope.role)) return true;
  if (channel.chapterId) return isChapterHead(scope.role) && scope.headChapterIds.includes(channel.chapterId);
  return false;
}

export async function setMessagePinned(input: {
  scope: AccessScope;
  messageId: string;
  pinned: boolean;
  actor: { id: string | null; name: string };
}): Promise<Message> {
  return getDb().transaction(async (tx) => {
    const [message] = await tx.select().from(messages).where(eq(messages.id, input.messageId)).limit(1);
    if (!message) throw notFound('Mesaj bulunamadı.');
    const [channel] = await tx.select().from(channels).where(eq(channels.id, message.channelId)).limit(1);
    if (!channel || !canModerateChannel(input.scope, channel)) throw validationError('Bu mesajı sabitleme yetkiniz yok.');

    const [updated] = await tx
      .update(messages)
      .set({ isPinned: input.pinned, pinnedAt: input.pinned ? new Date() : null })
      .where(eq(messages.id, input.messageId))
      .returning();
    if (!updated) throw notFound('Mesaj bulunamadı.');
    return updated;
  });
}

/** Soft delete — the row is preserved (author/timestamp/audit trail), the body is no longer shown. */
export async function deleteMessage(input: {
  scope: AccessScope;
  messageId: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [message] = await tx.select().from(messages).where(eq(messages.id, input.messageId)).limit(1);
    if (!message) throw notFound('Mesaj bulunamadı.');
    const [channel] = await tx.select().from(channels).where(eq(channels.id, message.channelId)).limit(1);
    if (!channel) throw notFound('Kanal bulunamadı.');

    const isAuthor = message.authorId !== null && message.authorId === input.scope.userId;
    if (!isAuthor && !canModerateChannel(input.scope, channel)) {
      throw validationError('Bu mesajı silme yetkiniz yok.');
    }

    await tx.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, input.messageId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.messageDeleted,
        targetType: 'message',
        targetId: message.id,
        chapterId: channel.chapterId,
      },
      tx,
    );
  });
}
