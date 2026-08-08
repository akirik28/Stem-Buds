'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageRow } from './message-row';
import { Composer } from './composer';
import { pollNewMessagesAction } from '../actions';
import type { MessageWithAuthor } from '@/server/services/messaging-service';

const POLL_INTERVAL_MS = 4000;

/**
 * Owns the message list's live state so posting a message and polling for
 * new ones share one source of truth — otherwise the composer's own
 * just-sent message wouldn't appear until the next poll tick.
 *
 * Near-realtime via short-interval polling — no external pub/sub infra,
 * consistent with the rest of the platform's "reuse what exists" approach.
 */
export function ChannelThread({
  channelId,
  initialMessages,
  canModerate,
  canAnnounce,
  currentUserId,
}: {
  channelId: string;
  initialMessages: MessageWithAuthor[];
  canModerate: boolean;
  canAnnounce: boolean;
  currentUserId: string | null;
}) {
  const [items, setItems] = useState(initialMessages);
  const cursorRef = useRef<string>(
    initialMessages.length > 0 ? initialMessages[initialMessages.length - 1]!.createdAt.toISOString() : new Date(0).toISOString(),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  const poll = useCallback(async () => {
    const result = await pollNewMessagesAction(channelId, cursorRef.current);
    if (result.messages.length === 0) return;
    cursorRef.current = result.messages[result.messages.length - 1]!.createdAt.toISOString();
    setItems((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const fresh = result.messages.filter((m) => !existingIds.has(m.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, [channelId]);

  useEffect(() => {
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [poll]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'nearest' });
  }, [items.length]);

  const handleUpdated = useCallback((messageId: string, patch: Partial<MessageWithAuthor>) => {
    setItems((prev) => prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m)));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-navy-400">Bu kanalda henüz mesaj yok. İlk mesajı siz gönderin.</p>
        ) : (
          items.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              channelId={channelId}
              canModerate={canModerate}
              currentUserId={currentUserId}
              onUpdated={handleUpdated}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <Composer channelId={channelId} canAnnounce={canAnnounce} onPosted={poll} />
    </div>
  );
}
