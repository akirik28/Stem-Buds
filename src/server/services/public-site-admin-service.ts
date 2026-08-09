import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/server/db';
import {
  contactMessages,
  publicHighlights,
  publicLeadershipProfiles,
  publicMedia,
  publicNewsPosts,
} from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { getEnv } from '@/server/env';
import { AUDIT_ACTIONS, recordAudit } from './audit';
import type { PublicHighlight, PublicLeadershipProfile, PublicMedia, PublicNewsPost } from './public-site-service';

/**
 * Executive-only management of the public site's editable content.
 *
 * Every function here trusts its caller already checked
 * `canManagePublicContent` — same convention as the rest of the service
 * layer (see `program-service.ts`). Permission is enforced once, in the
 * Server Action.
 */

type Actor = { id: string | null; name: string };

function slugify(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || 'haber';
  const db = getDb();
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const rows = await db.select({ id: publicNewsPosts.id }).from(publicNewsPosts).where(eq(publicNewsPosts.slug, candidate)).limit(1);
    const hit = rows[0];
    if (!hit || hit.id === excludeId) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

export async function listAllHighlights(): Promise<PublicHighlight[]> {
  return getDb().select().from(publicHighlights).orderBy(publicHighlights.displayOrder);
}

export type UpsertHighlightInput = {
  id?: string;
  key: string;
  title: string;
  body: string;
  displayOrder: number;
  isPublic: boolean;
  actor: Actor;
};

export async function upsertHighlight(input: UpsertHighlightInput): Promise<PublicHighlight> {
  const key = input.key.trim();
  const title = input.title.trim();
  const body = input.body.trim();
  if (key.length < 2) throw validationError('Anahtar en az 2 karakter olmalıdır.');
  if (title.length < 2) throw validationError('Başlık en az 2 karakter olmalıdır.');
  if (body.length < 2) throw validationError('İçerik boş olamaz.');

  const db = getDb();
  const [existingByKey] = await db.select({ id: publicHighlights.id }).from(publicHighlights).where(eq(publicHighlights.key, key)).limit(1);
  if (existingByKey && existingByKey.id !== input.id) throw conflict('Bu anahtar zaten kullanılıyor.');

  if (input.id) {
    const [updated] = await db
      .update(publicHighlights)
      .set({ key, title, body, displayOrder: input.displayOrder, isPublic: input.isPublic, updatedById: input.actor.id, updatedAt: new Date() })
      .where(eq(publicHighlights.id, input.id))
      .returning();
    if (!updated) throw notFound('Öne çıkan içerik bulunamadı.');
    await recordAudit({
      actorUserId: input.actor.id,
      actorName: input.actor.name,
      action: AUDIT_ACTIONS.highlightUpdated,
      targetType: 'public_highlight',
      targetId: updated.id,
      targetLabel: updated.title,
    });
    return updated;
  }

  const [created] = await db
    .insert(publicHighlights)
    .values({ key, title, body, displayOrder: input.displayOrder, isPublic: input.isPublic, updatedById: input.actor.id })
    .onConflictDoNothing({ target: publicHighlights.key })
    .returning();
  if (!created) throw conflict('Bu anahtar zaten kullanılıyor.');
  await recordAudit({
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: AUDIT_ACTIONS.highlightUpdated,
    targetType: 'public_highlight',
    targetId: created.id,
    targetLabel: created.title,
  });
  return created;
}

export async function deleteHighlight(id: string, actor: Actor): Promise<void> {
  const [deleted] = await getDb().delete(publicHighlights).where(eq(publicHighlights.id, id)).returning();
  if (!deleted) throw notFound('Öne çıkan içerik bulunamadı.');
  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: AUDIT_ACTIONS.highlightDeleted,
    targetType: 'public_highlight',
    targetId: id,
    targetLabel: deleted.title,
  });
}

// ---------------------------------------------------------------------------
// Leadership profiles
// ---------------------------------------------------------------------------

export async function listAllLeadershipProfiles(): Promise<PublicLeadershipProfile[]> {
  return getDb().select().from(publicLeadershipProfiles).orderBy(publicLeadershipProfiles.displayOrder);
}

export type UpsertLeadershipProfileInput = {
  id?: string;
  fullName: string;
  title: string;
  bio: string;
  displayOrder: number;
  isPublic: boolean;
  actor: Actor;
};

export async function upsertLeadershipProfile(input: UpsertLeadershipProfileInput): Promise<PublicLeadershipProfile> {
  const fullName = input.fullName.trim();
  const title = input.title.trim();
  const bio = input.bio.trim();
  if (fullName.length < 2) throw validationError('Ad soyad en az 2 karakter olmalıdır.');
  if (title.length < 2) throw validationError('Unvan en az 2 karakter olmalıdır.');
  if (bio.length < 2) throw validationError('Biyografi boş olamaz.');

  const db = getDb();
  if (input.id) {
    const [updated] = await db
      .update(publicLeadershipProfiles)
      .set({ fullName, title, bio, displayOrder: input.displayOrder, isPublic: input.isPublic, updatedAt: new Date() })
      .where(eq(publicLeadershipProfiles.id, input.id))
      .returning();
    if (!updated) throw notFound('Yönetim profili bulunamadı.');
    await recordAudit({
      actorUserId: input.actor.id,
      actorName: input.actor.name,
      action: input.isPublic ? AUDIT_ACTIONS.leadershipPublished : AUDIT_ACTIONS.leadershipUpdated,
      targetType: 'public_leadership_profile',
      targetId: updated.id,
      targetLabel: updated.fullName,
    });
    return updated;
  }

  const [created] = await db
    .insert(publicLeadershipProfiles)
    .values({ fullName, title, bio, displayOrder: input.displayOrder, isPublic: input.isPublic })
    .returning();
  if (!created) throw notFound('Yönetim profili oluşturulamadı.');
  await recordAudit({
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: AUDIT_ACTIONS.leadershipCreated,
    targetType: 'public_leadership_profile',
    targetId: created.id,
    targetLabel: created.fullName,
  });
  return created;
}

export async function deleteLeadershipProfile(id: string, actor: Actor): Promise<void> {
  const [deleted] = await getDb().delete(publicLeadershipProfiles).where(eq(publicLeadershipProfiles.id, id)).returning();
  if (!deleted) throw notFound('Yönetim profili bulunamadı.');
  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: AUDIT_ACTIONS.leadershipDeleted,
    targetType: 'public_leadership_profile',
    targetId: id,
    targetLabel: deleted.fullName,
  });
}

// ---------------------------------------------------------------------------
// News posts
// ---------------------------------------------------------------------------

export async function listAllNewsPosts(): Promise<PublicNewsPost[]> {
  return getDb().select().from(publicNewsPosts).orderBy(desc(publicNewsPosts.createdAt));
}

export async function getNewsPostById(id: string): Promise<PublicNewsPost | null> {
  const [row] = await getDb().select().from(publicNewsPosts).where(eq(publicNewsPosts.id, id)).limit(1);
  return row ?? null;
}

export type CreateNewsPostInput = {
  title: string;
  summary: string;
  body: string;
  actor: Actor;
};

export async function createNewsPost(input: CreateNewsPostInput): Promise<PublicNewsPost> {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const body = input.body.trim();
  if (title.length < 2) throw validationError('Başlık en az 2 karakter olmalıdır.');
  if (summary.length < 2) throw validationError('Özet boş olamaz.');
  if (body.length < 2) throw validationError('İçerik boş olamaz.');

  const slug = await uniqueSlug(title);
  const [created] = await getDb()
    .insert(publicNewsPosts)
    .values({ slug, title, summary, body, authorId: input.actor.id })
    .returning();
  if (!created) throw notFound('Haber oluşturulamadı.');
  await recordAudit({
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: AUDIT_ACTIONS.newsCreated,
    targetType: 'public_news_post',
    targetId: created.id,
    targetLabel: created.title,
  });
  return created;
}

export type UpdateNewsPostInput = {
  id: string;
  title: string;
  summary: string;
  body: string;
  actor: Actor;
};

export async function updateNewsPost(input: UpdateNewsPostInput): Promise<PublicNewsPost> {
  const title = input.title.trim();
  const summary = input.summary.trim();
  const body = input.body.trim();
  if (title.length < 2) throw validationError('Başlık en az 2 karakter olmalıdır.');
  if (summary.length < 2) throw validationError('Özet boş olamaz.');
  if (body.length < 2) throw validationError('İçerik boş olamaz.');

  const existing = await getNewsPostById(input.id);
  if (!existing) throw notFound('Haber bulunamadı.');

  const slug = existing.title === title ? existing.slug : await uniqueSlug(title, existing.id);
  const [updated] = await getDb()
    .update(publicNewsPosts)
    .set({ title, summary, body, slug, updatedAt: new Date() })
    .where(eq(publicNewsPosts.id, input.id))
    .returning();
  if (!updated) throw notFound('Haber bulunamadı.');
  await recordAudit({
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: AUDIT_ACTIONS.newsUpdated,
    targetType: 'public_news_post',
    targetId: updated.id,
    targetLabel: updated.title,
  });
  return updated;
}

export async function setNewsPublished(id: string, isPublished: boolean, actor: Actor): Promise<PublicNewsPost> {
  const [updated] = await getDb()
    .update(publicNewsPosts)
    .set({ isPublished, publishedAt: isPublished ? new Date() : null, updatedAt: new Date() })
    .where(eq(publicNewsPosts.id, id))
    .returning();
  if (!updated) throw notFound('Haber bulunamadı.');
  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: isPublished ? AUDIT_ACTIONS.newsPublished : AUDIT_ACTIONS.newsUnpublished,
    targetType: 'public_news_post',
    targetId: updated.id,
    targetLabel: updated.title,
  });
  return updated;
}

export async function deleteNewsPost(id: string, actor: Actor): Promise<void> {
  const [deleted] = await getDb().delete(publicNewsPosts).where(eq(publicNewsPosts.id, id)).returning();
  if (!deleted) throw notFound('Haber bulunamadı.');
  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: AUDIT_ACTIONS.newsDeleted,
    targetType: 'public_news_post',
    targetId: id,
    targetLabel: deleted.title,
  });
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

export async function listAllMedia(): Promise<PublicMedia[]> {
  return getDb().select().from(publicMedia).orderBy(desc(publicMedia.createdAt));
}

export type UploadPublicMediaInput = {
  fileName: string;
  contentType: string;
  bytes: Buffer;
  altText: string;
  actor: Actor;
};

/**
 * Writes an uploaded image to `UPLOAD_DIR/public-media/` under a random,
 * server-generated name — the on-disk key is never derived from the
 * client-supplied file name, so nothing about the request can influence
 * where on disk the file lands.
 */
export async function uploadPublicMedia(input: UploadPublicMediaInput): Promise<PublicMedia> {
  const extension = ALLOWED_IMAGE_TYPES[input.contentType];
  if (!extension) throw validationError('Yalnızca JPEG, PNG, WEBP veya GIF görseli yükleyebilirsiniz.');
  if (input.bytes.byteLength === 0) throw validationError('Dosya boş.');
  if (input.bytes.byteLength > MAX_MEDIA_BYTES) throw validationError('Dosya 5 MB sınırını aşıyor.');

  const altText = input.altText.trim();
  if (altText.length < 2) throw validationError('Alternatif metin en az 2 karakter olmalıdır.');

  const storageKey = path.join('public-media', `${randomUUID()}.${extension}`);
  const uploadDir = path.resolve(getEnv().UPLOAD_DIR);
  const filePath = path.resolve(uploadDir, storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, input.bytes);

  const [created] = await getDb()
    .insert(publicMedia)
    .values({
      fileName: input.fileName.slice(0, 255),
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
      storageKey,
      altText,
      uploadedById: input.actor.id,
    })
    .returning();
  if (!created) throw notFound('Görsel kaydedilemedi.');
  await recordAudit({
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: AUDIT_ACTIONS.publicMediaUploaded,
    targetType: 'public_media',
    targetId: created.id,
    targetLabel: created.fileName,
  });
  return created;
}

export async function deletePublicMedia(id: string, actor: Actor): Promise<void> {
  const [deleted] = await getDb().delete(publicMedia).where(eq(publicMedia.id, id)).returning();
  if (!deleted) throw notFound('Görsel bulunamadı.');

  const uploadDir = path.resolve(getEnv().UPLOAD_DIR);
  const filePath = path.resolve(uploadDir, deleted.storageKey);
  if (filePath.startsWith(uploadDir)) {
    await unlink(filePath).catch(() => undefined);
  }

  await recordAudit({
    actorUserId: actor.id,
    actorName: actor.name,
    action: AUDIT_ACTIONS.publicMediaDeleted,
    targetType: 'public_media',
    targetId: id,
    targetLabel: deleted.fileName,
  });
}

// ---------------------------------------------------------------------------
// Contact messages inbox
// ---------------------------------------------------------------------------

export type ContactMessage = typeof contactMessages.$inferSelect;

export async function listContactMessages(filter: { onlyUnhandled?: boolean } = {}): Promise<ContactMessage[]> {
  const query = getDb().select().from(contactMessages).orderBy(desc(contactMessages.createdAt));
  if (filter.onlyUnhandled) {
    return query.where(isNull(contactMessages.handledAt));
  }
  return query;
}

export async function countUnhandledContactMessages(): Promise<number> {
  const rows = await getDb()
    .select({ id: contactMessages.id })
    .from(contactMessages)
    .where(isNull(contactMessages.handledAt));
  return rows.length;
}

/** Idempotent: marking an already-handled message again is a no-op, not an error. */
export async function markContactMessageHandled(id: string, actor: Actor): Promise<ContactMessage> {
  const [updated] = await getDb()
    .update(contactMessages)
    .set({ handledAt: new Date(), handledById: actor.id })
    .where(and(eq(contactMessages.id, id), isNull(contactMessages.handledAt)))
    .returning();

  if (updated) {
    await recordAudit({
      actorUserId: actor.id,
      actorName: actor.name,
      action: AUDIT_ACTIONS.contactMessageHandled,
      targetType: 'contact_message',
      targetId: id,
      targetLabel: updated.fullName,
    });
    return updated;
  }

  const [existing] = await getDb().select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1);
  if (!existing) throw notFound('Mesaj bulunamadı.');
  return existing;
}
