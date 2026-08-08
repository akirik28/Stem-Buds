'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { formatRelativeTr } from '@/lib/format';
import { markNotificationReadAction } from './actions';
import type { Notification } from '@/server/services/notification-service';

export function NotificationRow({ notification }: { notification: Notification }) {
  const [pending, startTransition] = useTransition();
  const isUnread = notification.readAt === null;

  return (
    <Card className={isUnread ? 'ring-1 ring-inset ring-navy-200' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {isUnread ? <StatusPill tone="info">Yeni</StatusPill> : null}
            <p className="font-medium text-navy-900">{notification.title}</p>
          </div>
          {notification.body ? <p className="mt-1 text-sm text-navy-600">{notification.body}</p> : null}
          <p className="mt-1 text-xs text-navy-400">{formatRelativeTr(notification.createdAt)}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {notification.linkUrl ? (
          <Link
            href={notification.linkUrl}
            className="text-sm text-navy-700 hover:underline"
            onClick={() => {
              if (isUnread) startTransition(() => void markNotificationReadAction(notification.id));
            }}
          >
            Görüntüle →
          </Link>
        ) : null}
        {isUnread ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => startTransition(() => void markNotificationReadAction(notification.id))}
          >
            Okundu işaretle
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
