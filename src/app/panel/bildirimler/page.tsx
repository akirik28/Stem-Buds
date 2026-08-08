import type { Metadata } from 'next';
import { requireAuthContext } from '@/server/auth/context';
import { listNotificationsForUser } from '@/server/services/notification-service';
import { EmptyState } from '@/components/ui/card';
import { MarkAllReadButton } from './mark-all-read-button';
import { NotificationRow } from './notification-row';

export const metadata: Metadata = {
  title: 'Bildirimler',
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const context = await requireAuthContext();
  const notifications = await listNotificationsForUser(context.user.id);
  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-navy-900">Bildirimler</h1>
          <p className="mt-1 text-sm text-navy-500">
            {unreadCount > 0 ? `${unreadCount} okunmamış bildirim.` : 'Tüm bildirimler okundu.'}
          </p>
        </div>
        {unreadCount > 0 ? <MarkAllReadButton /> : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="Henüz bildiriminiz bulunmuyor." />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationRow key={notification.id} notification={notification} />
          ))}
        </div>
      )}
    </div>
  );
}
