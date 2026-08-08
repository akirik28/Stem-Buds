'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { markAllNotificationsReadAction } from './actions';

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(() => void markAllNotificationsReadAction())}>
      {pending ? 'İşaretleniyor…' : 'Tümünü okundu işaretle'}
    </Button>
  );
}
