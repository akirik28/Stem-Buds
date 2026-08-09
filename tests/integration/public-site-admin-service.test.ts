import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  countUnhandledContactMessages,
  createNewsPost,
  deleteHighlight,
  deleteLeadershipProfile,
  deleteNewsPost,
  deletePublicMedia,
  listAllHighlights,
  listAllLeadershipProfiles,
  listAllMedia,
  listAllNewsPosts,
  listContactMessages,
  markContactMessageHandled,
  setNewsPublished,
  updateNewsPost,
  uploadPublicMedia,
  upsertHighlight,
  upsertLeadershipProfile,
} from '@/server/services/public-site-admin-service';
import { submitContactMessage } from '@/server/services/public-site-service';
import { getEnv } from '@/server/env';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'Test Yönetici' };

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDb();
});

describe('highlights', () => {
  it('creates, updates, and deletes a highlight', async () => {
    const created = await upsertHighlight({
      key: 'impact-2026',
      title: 'Etki',
      body: 'Açıklama',
      displayOrder: 1,
      isPublic: false,
      actor,
    });
    expect(created.isPublic).toBe(false);

    const updated = await upsertHighlight({
      id: created.id,
      key: 'impact-2026',
      title: 'Etki (güncel)',
      body: 'Açıklama güncel',
      displayOrder: 2,
      isPublic: true,
      actor,
    });
    expect(updated.title).toBe('Etki (güncel)');
    expect(updated.isPublic).toBe(true);

    const all = await listAllHighlights();
    expect(all.map((h) => h.id)).toContain(created.id);

    await deleteHighlight(created.id, actor);
    expect((await listAllHighlights()).map((h) => h.id)).not.toContain(created.id);
  });

  it('rejects a duplicate key on create, but allows keeping the same key on update', async () => {
    await upsertHighlight({ key: 'dup', title: 'AA', body: 'xx', displayOrder: 0, isPublic: false, actor });
    await expect(
      upsertHighlight({ key: 'dup', title: 'BB', body: 'xx', displayOrder: 0, isPublic: false, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'conflict');
  });

  it('rejects a title shorter than 2 characters', async () => {
    await expect(
      upsertHighlight({ key: 'k', title: 'a', body: 'x', displayOrder: 0, isPublic: false, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('leadership profiles', () => {
  it('creates, publishes, and deletes a profile', async () => {
    const created = await upsertLeadershipProfile({
      fullName: 'Ada Lovelace',
      title: 'Bölge Direktörü',
      bio: 'Kısa biyografi.',
      displayOrder: 0,
      isPublic: false,
      actor,
    });
    expect(created.isPublic).toBe(false);

    const published = await upsertLeadershipProfile({
      id: created.id,
      fullName: created.fullName,
      title: created.title,
      bio: created.bio,
      displayOrder: 0,
      isPublic: true,
      actor,
    });
    expect(published.isPublic).toBe(true);

    await deleteLeadershipProfile(created.id, actor);
    expect((await listAllLeadershipProfiles()).map((p) => p.id)).not.toContain(created.id);
  });
});

describe('news posts', () => {
  it('creates a post with a generated unique slug, updates it, publishes, then unpublishes', async () => {
    const post = await createNewsPost({ title: 'Yeni Dönem Başladı', summary: 'Özet', body: 'İçerik', actor });
    expect(post.slug).toBe('yeni-donem-basladi');
    expect(post.isPublished).toBe(false);
    expect(post.publishedAt).toBeNull();

    const second = await createNewsPost({ title: 'Yeni Dönem Başladı', summary: 'Özet 2', body: 'İçerik 2', actor });
    expect(second.slug).toBe('yeni-donem-basladi-2');

    const updated = await updateNewsPost({ id: post.id, title: 'Güncellenmiş Başlık', summary: 'Özet', body: 'İçerik', actor });
    expect(updated.slug).toBe('guncellenmis-baslik');

    const published = await setNewsPublished(post.id, true, actor);
    expect(published.isPublished).toBe(true);
    expect(published.publishedAt).not.toBeNull();

    const unpublished = await setNewsPublished(post.id, false, actor);
    expect(unpublished.isPublished).toBe(false);
    expect(unpublished.publishedAt).toBeNull();

    await deleteNewsPost(post.id, actor);
    expect((await listAllNewsPosts()).map((p) => p.id)).not.toContain(post.id);
  });

  it('rejects a summary shorter than 2 characters', async () => {
    await expect(
      createNewsPost({ title: 'Başlık', summary: 'a', body: 'İçerik', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('media uploads', () => {
  const createdFilePaths: string[] = [];

  afterAll(async () => {
    await Promise.all(createdFilePaths.map((filePath) => unlink(filePath).catch(() => undefined)));
  });

  it('rejects a disallowed content type', async () => {
    await expect(
      uploadPublicMedia({ fileName: 'a.pdf', contentType: 'application/pdf', bytes: Buffer.from('x'), altText: 'test', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a file over the size limit', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(
      uploadPublicMedia({ fileName: 'big.png', contentType: 'image/png', bytes: oversized, altText: 'test', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('writes the file under UPLOAD_DIR and records it, then removes both on delete', async () => {
    const bytes = Buffer.from('fake-png-bytes');
    const created = await uploadPublicMedia({ fileName: 'logo.png', contentType: 'image/png', bytes, altText: 'Logo', actor });
    expect(created.storageKey).toMatch(/^public-media\/.+\.png$/);
    expect(created.byteSize).toBe(bytes.byteLength);

    const uploadDir = path.resolve(getEnv().UPLOAD_DIR);
    const filePath = path.resolve(uploadDir, created.storageKey);
    createdFilePaths.push(filePath);

    const all = await listAllMedia();
    expect(all.map((m) => m.id)).toContain(created.id);

    await deletePublicMedia(created.id, actor);
    expect((await listAllMedia()).map((m) => m.id)).not.toContain(created.id);
    await expect(unlink(filePath)).rejects.toThrow();
  });
});

describe('contact message inbox', () => {
  it('lists messages and marks one handled idempotently', async () => {
    await submitContactMessage({
      fullName: 'Veli',
      email: 'veli@example.com',
      reason: 'information',
      message: 'Bilgi almak istiyorum, teşekkürler.',
      requestHeaders: new Headers({ 'x-forwarded-for': '198.51.100.5' }),
    });

    const [message] = await listContactMessages();
    expect(message?.handledAt).toBeNull();
    expect(await countUnhandledContactMessages()).toBe(1);

    const handled = await markContactMessageHandled(message!.id, actor);
    expect(handled.handledAt).not.toBeNull();
    expect(await countUnhandledContactMessages()).toBe(0);

    const handledAgain = await markContactMessageHandled(message!.id, actor);
    expect(handledAgain.handledAt?.getTime()).toBe(handled.handledAt?.getTime());
  });
});
