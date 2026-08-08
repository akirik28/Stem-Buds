import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getPublishedNewsPostBySlug,
  listPublicHighlights,
  listPublicLeadershipProfiles,
  listPublishedNewsPosts,
  submitContactMessage,
} from '@/server/services/public-site-service';
import { getDb } from '@/server/db';
import { contactMessages, publicHighlights, publicLeadershipProfiles, publicNewsPosts } from '@/server/db/schema';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDb();
});

function headersFor(ip: string): Headers {
  return new Headers({ 'x-forwarded-for': ip });
}

describe('public reads — isPublic/isPublished gating', () => {
  it('never returns a highlight, leadership profile, or news post that is not public/published', async () => {
    await getDb().insert(publicHighlights).values([
      { key: 'k1', title: 'Public one', body: 'x', isPublic: true },
      { key: 'k2', title: 'Draft one', body: 'x', isPublic: false },
    ]);
    await getDb().insert(publicLeadershipProfiles).values([
      { fullName: 'Public Person', title: 'x', bio: 'x', isPublic: true },
      { fullName: 'Draft Person', title: 'x', bio: 'x', isPublic: false },
    ]);
    await getDb().insert(publicNewsPosts).values([
      { slug: 'published-post', title: 'Published', summary: 'x', body: 'x', isPublished: true, publishedAt: new Date() },
      { slug: 'draft-post', title: 'Draft', summary: 'x', body: 'x', isPublished: false },
    ]);

    const highlights = await listPublicHighlights();
    expect(highlights.map((h) => h.title)).toEqual(['Public one']);

    const leadership = await listPublicLeadershipProfiles();
    expect(leadership.map((l) => l.fullName)).toEqual(['Public Person']);

    const news = await listPublishedNewsPosts();
    expect(news.map((n) => n.slug)).toEqual(['published-post']);

    expect(await getPublishedNewsPostBySlug('draft-post')).toBeNull();
    expect(await getPublishedNewsPostBySlug('published-post')).not.toBeNull();
  });
});

describe('submitContactMessage', () => {
  const validInput = {
    fullName: 'Test User',
    email: 'test@example.com',
    reason: 'information' as const,
    message: 'Bu bir test mesajıdır, en az on karakter.',
  };

  it('stores a valid message with a hashed IP, never the raw address', async () => {
    await submitContactMessage({ ...validInput, requestHeaders: headersFor('203.0.113.5') });
    const [row] = await getDb().select().from(contactMessages).limit(1);
    expect(row?.fullName).toBe('Test User');
    expect(row?.ipHash).not.toBe('203.0.113.5');
    expect(row?.ipHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cannot create a user account — this is purely a message insert', async () => {
    await submitContactMessage({ ...validInput, requestHeaders: headersFor('203.0.113.6') });
    // Sanity: the function's return type is void and no users table write happens.
    const { users } = await import('@/server/db/schema');
    const userCount = await getDb().select().from(users);
    expect(userCount).toHaveLength(0);
  });

  it('rejects an invalid e-mail address', async () => {
    await expect(
      submitContactMessage({ ...validInput, email: 'not-an-email', requestHeaders: headersFor('203.0.113.7') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a message that is too short', async () => {
    await expect(
      submitContactMessage({ ...validInput, message: 'short', requestHeaders: headersFor('203.0.113.8') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rate-limits repeated submissions from the same IP', async () => {
    const ip = '203.0.113.9';
    for (let i = 0; i < 5; i++) {
      await submitContactMessage({ ...validInput, requestHeaders: headersFor(ip) });
    }
    await expect(submitContactMessage({ ...validInput, requestHeaders: headersFor(ip) })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });

  it('never lets one IP’s rate limit affect another IP', async () => {
    for (let i = 0; i < 5; i++) {
      await submitContactMessage({ ...validInput, requestHeaders: headersFor('203.0.113.10') });
    }
    // A different IP must still succeed.
    await expect(submitContactMessage({ ...validInput, requestHeaders: headersFor('203.0.113.11') })).resolves.toBeUndefined();
  });
});
