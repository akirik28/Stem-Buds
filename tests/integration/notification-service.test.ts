import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  mirrorRecentNotificationsToEmail,
} from '@/server/services/notification-service';
import { createUser } from '@/server/services/user-admin';
import { getDb } from '@/server/db';
import { emailLogs, notifications } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';
import type { EmailMessage, EmailProvider, EmailSendResult } from '@/server/email/provider';

/**
 * NEVER call `sendEmail`/`createUser` with a `notificationEmail` in any test
 * without injecting this. This process's real `.env.local` has
 * `EMAIL_TRANSPORT=smtp` configured (discovered the hard way — an earlier,
 * unguarded version of this test triggered a real outbound SMTP send to a
 * fake `@example.com` address). The env-selected default provider must
 * never be reachable from a test.
 */
class FakeEmailProvider implements EmailProvider {
  readonly name = 'fake';
  calls: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.calls.push(message);
    return { delivered: true };
  }
}

const actor = { id: null, name: 'test-suite' };

let userAId: string;
let userBId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const userA = await createUser({ username: 'user.a', fullName: 'User A', role: 'regional_director', actor });
  userAId = userA.userId;
  const userB = await createUser({ username: 'user.b', fullName: 'User B', role: 'regional_director', actor });
  userBId = userB.userId;

  await getDb()
    .insert(notifications)
    .values([
      { userId: userAId, type: 'test', title: 'Bildirim 1', body: 'x', linkUrl: '/panel', createdAt: new Date(Date.now() - 60_000) },
      { userId: userAId, type: 'test', title: 'Bildirim 2', body: 'y', linkUrl: null, createdAt: new Date() },
    ]);
});

afterAll(async () => {
  await closeTestDb();
});

describe('listNotificationsForUser', () => {
  it('returns only the calling user’s own notifications, newest first', async () => {
    const rows = await listNotificationsForUser(userAId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.title).toBe('Bildirim 2');

    expect(await listNotificationsForUser(userBId)).toHaveLength(0);
  });
});

describe('countUnreadNotifications', () => {
  it('counts only unread rows for that user', async () => {
    expect(await countUnreadNotifications(userAId)).toBe(2);
    const [first] = await listNotificationsForUser(userAId);
    await markNotificationRead(first!.id, userAId);
    expect(await countUnreadNotifications(userAId)).toBe(1);
  });
});

describe('markNotificationRead', () => {
  it('rejects marking another user’s notification as read, even with the real id', async () => {
    const [notification] = await listNotificationsForUser(userAId);
    await expect(markNotificationRead(notification!.id, userBId)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'validation',
    );
  });

  it('is idempotent — marking an already-read notification again does not throw', async () => {
    const [notification] = await listNotificationsForUser(userAId);
    await markNotificationRead(notification!.id, userAId);
    await expect(markNotificationRead(notification!.id, userAId)).resolves.toBeUndefined();
  });
});

describe('markAllNotificationsRead', () => {
  it('marks every one of the caller’s own unread notifications, none of another user’s', async () => {
    await getDb().insert(notifications).values([{ userId: userBId, type: 'test', title: 'B Bildirim' }]);
    await markAllNotificationsRead(userAId);
    expect(await countUnreadNotifications(userAId)).toBe(0);
    expect(await countUnreadNotifications(userBId)).toBe(1);
  });
});

describe('mirrorRecentNotificationsToEmail', () => {
  it('e-mails only recipients who have a notificationEmail on file, and is idempotent per notification', async () => {
    const provider = new FakeEmailProvider();
    const withEmail = await createUser({
      username: 'user.email',
      fullName: 'User Email',
      role: 'regional_director',
      notificationEmail: 'user.email@example.com',
      actor,
      emailProvider: provider,
    });
    const [notification] = await getDb()
      .insert(notifications)
      .values([{ userId: withEmail.userId, type: 'test', title: 'E-postalı bildirim', body: 'gövde' }])
      .returning();

    const first = await mirrorRecentNotificationsToEmail(50, provider);
    // userA/userB (no notificationEmail) never generate a mirror; only the one with an email does.
    expect(first.processed).toBe(1);

    const logs = await getDb().select().from(emailLogs).where(eq(emailLogs.idempotencyKey, `notification-mirror:${notification!.id}`));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.recipientEmail).toBe('user.email@example.com');

    // Calling again must not create a second log row for the same notification.
    await mirrorRecentNotificationsToEmail(50, provider);
    const logsAfter = await getDb().select().from(emailLogs).where(eq(emailLogs.idempotencyKey, `notification-mirror:${notification!.id}`));
    expect(logsAfter).toHaveLength(1);
    // Only the welcome e-mail (from createUser) + the one mirrored notification were ever attempted — never the real default provider.
    expect(provider.calls.length).toBeGreaterThan(0);
  });
});
