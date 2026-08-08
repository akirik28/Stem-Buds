'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { formatRelativeTr } from '@/lib/format';
import { deleteMessageAction, setMessagePinnedAction } from '../actions';
import type { MessageWithAuthor } from '@/server/services/messaging-service';

export function MessageRow({
  message,
  channelId,
  canModerate,
  currentUserId,
  onUpdated,
}: {
  message: MessageWithAuthor;
  channelId: string;
  canModerate: boolean;
  currentUserId: string | null;
  /**
   * Pin/delete mutate the DB and call `revalidatePath`, but this row's
   * `message` prop is client-owned state seeded once from the server
   * render — revalidating the route does not reach into it. Polling can't
   * fill the gap either: it only fetches messages newer than the last seen
   * one, never edits to ones already loaded. So the mutating actions report
   * their result back up through this callback instead.
   */
  onUpdated: (messageId: string, patch: Partial<MessageWithAuthor>) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isOwn = message.authorId !== null && message.authorId === currentUserId;
  const canDelete = canModerate || isOwn;

  if (message.deletedAt) {
    return <p className="px-3 py-1.5 text-xs italic text-navy-300">Bu mesaj silindi.</p>;
  }

  return (
    <div className={`rounded-lg px-3 py-2 ${message.isAnnouncement ? 'bg-amber-50' : message.isPinned ? 'bg-navy-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-navy-400">
        <span className="font-medium text-navy-700">{message.authorName ?? 'Sistem'}</span>
        {message.isOversightAuthor ? <StatusPill tone="neutral">Gözlemci</StatusPill> : null}
        {message.isAnnouncement ? <StatusPill tone="warn">📢 Duyuru</StatusPill> : null}
        {message.isPinned ? <StatusPill tone="info">📌 Sabit</StatusPill> : null}
        <span>{formatRelativeTr(message.createdAt)}</span>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-navy-800">{message.body}</p>
      {error ? <Alert tone="error" className="mt-2">{error}</Alert> : null}
      {canModerate || canDelete ? (
        <div className="mt-2 flex gap-2">
          {canModerate ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await setMessagePinnedAction(message.id, !message.isPinned, channelId);
                  if (result.error) setError(result.error);
                  else onUpdated(message.id, { isPinned: !message.isPinned, pinnedAt: !message.isPinned ? new Date() : null });
                })
              }
            >
              {message.isPinned ? 'Sabitlemeyi kaldır' : 'Sabitle'}
            </Button>
          ) : null}
          {canDelete ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteMessageAction(message.id, channelId);
                  if (result.error) setError(result.error);
                  else onUpdated(message.id, { deletedAt: new Date() });
                })
              }
            >
              Sil
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
