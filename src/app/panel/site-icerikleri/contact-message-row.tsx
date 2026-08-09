'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { formatDateTimeTr } from '@/lib/format';
import { contactReasonLabels, type ContactReason } from '@/lib/i18n/tr';
import { markContactHandledAction, type ActionState } from './actions';

export type ContactMessageData = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  reason: ContactReason;
  message: string;
  handledAt: string | null;
  createdAt: string;
};

export function ContactMessageRow({ item }: { item: ContactMessageData }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);
  const [handled, setHandled] = useState(item.handledAt !== null);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-navy-900">{item.fullName}</p>
            <StatusPill tone="neutral">{contactReasonLabels[item.reason]}</StatusPill>
            {handled ? <StatusPill tone="ok">İşlendi</StatusPill> : <StatusPill tone="warn">Bekliyor</StatusPill>}
          </div>
          <p className="text-xs text-navy-400">
            {item.email}
            {item.phone ? ` · ${item.phone}` : ''} · {formatDateTimeTr(item.createdAt)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-navy-600">{item.message}</p>
        </div>
        {!handled ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markContactHandledAction(item.id);
                setState(result);
                if (!result.error) setHandled(true);
              })
            }
          >
            İşlendi Olarak İşaretle
          </Button>
        ) : null}
      </div>
      {state?.error ? (
        <Alert tone="error" className="mt-2">
          {state.error}
        </Alert>
      ) : null}
    </li>
  );
}
