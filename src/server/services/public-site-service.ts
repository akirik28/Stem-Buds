import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { contactMessages, publicHighlights, publicLeadershipProfiles, publicMedia, publicNewsPosts } from '@/server/db/schema';
import { validationError } from '@/server/errors';
import { clientIpFromHeaders, consumeRateLimit, hashIp } from './rate-limit';
import type { ContactReason } from '@/lib/i18n/tr';

/**
 * Public, unauthenticated reads for the marketing site, plus the one public
 * write (the contact form). Every read here is real-content-or-nothing —
 * `isPublic`/`isPublished` gate every row, and the caller is expected to
 * render an empty/omitted section rather than a placeholder when a list
 * comes back empty (see each function's own note).
 */

export type PublicHighlight = typeof publicHighlights.$inferSelect;
export type PublicLeadershipProfile = typeof publicLeadershipProfiles.$inferSelect;
export type PublicNewsPost = typeof publicNewsPosts.$inferSelect;
export type PublicMedia = typeof publicMedia.$inferSelect;

/** Editable homepage copy blocks, keyed. Empty until an Executive adds one via the CMS — callers must handle `[]` gracefully, never a placeholder. */
export async function listPublicHighlights(): Promise<PublicHighlight[]> {
  return getDb().select().from(publicHighlights).where(eq(publicHighlights.isPublic, true)).orderBy(publicHighlights.displayOrder);
}

export async function listPublicLeadershipProfiles(): Promise<PublicLeadershipProfile[]> {
  return getDb().select().from(publicLeadershipProfiles).where(eq(publicLeadershipProfiles.isPublic, true)).orderBy(publicLeadershipProfiles.displayOrder);
}

export async function listPublishedNewsPosts(limit = 20): Promise<PublicNewsPost[]> {
  return getDb()
    .select()
    .from(publicNewsPosts)
    .where(eq(publicNewsPosts.isPublished, true))
    .orderBy(desc(publicNewsPosts.publishedAt))
    .limit(limit);
}

export async function getPublishedNewsPostBySlug(slug: string): Promise<PublicNewsPost | null> {
  const [row] = await getDb()
    .select()
    .from(publicNewsPosts)
    .where(and(eq(publicNewsPosts.slug, slug), eq(publicNewsPosts.isPublished, true)))
    .limit(1);
  return row ?? null;
}

export async function getPublicMediaById(id: string): Promise<PublicMedia | null> {
  const [row] = await getDb().select().from(publicMedia).where(eq(publicMedia.id, id)).limit(1);
  return row ?? null;
}

const CONTACT_RATE_LIMIT = 5;
const CONTACT_RATE_WINDOW_MS = 60 * 60 * 1000;

export type SubmitContactMessageInput = {
  fullName: string;
  email: string;
  phone?: string | null;
  reason: ContactReason;
  message: string;
  requestHeaders: Headers;
};

/**
 * The one public write on this whole site. Deliberately cannot create an
 * account — see the schema's own doc comment — and is rate-limited per
 * hashed IP (never the raw address) using the same durable, no-external-
 * service counter the rest of the platform already relies on.
 */
export async function submitContactMessage(input: SubmitContactMessageInput): Promise<void> {
  const fullName = input.fullName.trim();
  const email = input.email.trim();
  const message = input.message.trim();
  if (fullName.length < 2) throw validationError('Ad soyad zorunludur.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError('Geçerli bir e-posta adresi girin.');
  if (message.length < 10) throw validationError('Mesaj en az 10 karakter olmalıdır.');
  if (message.length > 4000) throw validationError('Mesaj çok uzun.');

  const ip = clientIpFromHeaders(input.requestHeaders);
  const ipHash = hashIp(ip);
  if (ipHash) {
    const { allowed } = await consumeRateLimit(`contact-form:${ipHash}`, CONTACT_RATE_LIMIT, CONTACT_RATE_WINDOW_MS);
    if (!allowed) throw validationError('Çok fazla mesaj gönderildi. Lütfen daha sonra tekrar deneyin.');
  }

  await getDb().insert(contactMessages).values({
    fullName,
    email,
    phone: input.phone?.trim() || null,
    reason: input.reason,
    message,
    ipHash,
  });
}
