import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { notifications, users } from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import { sendEmail } from './email-service';
import type { EmailProvider } from '@/server/email/provider';

/**
 * The user-facing inbox for the `notifications` table — already populated
 * by the Phase 5 alert engine (project-staleness escalation) with no
 * consumer until now. Every notification is strictly own-user: there is no
 * cross-user read path here, so no additional Program/Chapter scoping is
 * needed beyond `userId` equality.
 */

export type Notification = typeof notifications.$inferSelect;

export async function listNotificationsForUser(userId: string, options: { limit?: number } = {}): Promise<Notification[]> {
  return getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(options.limit ?? 50);
}

export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const [row] = await getDb().select().from(notifications).where(eq(notifications.id, notificationId)).limit(1);
  if (!row) throw notFound('Bildirim bulunamadı.');
  if (row.userId !== userId) throw validationError('Bu bildirim size ait değil.');
  if (row.readAt) return;
  await getDb().update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, notificationId));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/**
 * Mirrors recent in-app notifications to e-mail for every recipient who has
 * a `notificationEmail` on file — meant to run periodically from the job
 * runner. Idempotent for free: `sendEmail`'s `idempotencyKey` is derived
 * from the notification's own id, so re-running this against the same
 * notifications never sends a duplicate, no separate "already mirrored"
 * bookkeeping needed here.
 */
export async function mirrorRecentNotificationsToEmail(limit = 50, provider?: EmailProvider): Promise<{ processed: number }> {
  const rows = await getDb()
    .select({ notification: notifications, email: users.notificationEmail })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(isNotNull(users.notificationEmail))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  let processed = 0;
  for (const row of rows) {
    if (!row.email) continue;
    await sendEmail({
      idempotencyKey: `notification-mirror:${row.notification.id}`,
      template: 'notification_mirror',
      recipientEmail: row.email,
      recipientUserId: row.notification.userId,
      subject: row.notification.title,
      body: row.notification.body ?? row.notification.title,
      relatedEntityType: 'notification',
      relatedEntityId: row.notification.id,
      provider,
    });
    processed++;
  }
  return { processed };
}
