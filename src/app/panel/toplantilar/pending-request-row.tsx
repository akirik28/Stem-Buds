'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { StatusPill } from '@/components/ui/status';
import { formatDateTr, formatTimeRangeTr } from '@/lib/format';
import { decideMeetingRequestAction, type MeetingActionState } from './actions';

type PendingRequest = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  requestNote: string | null;
  requestedByName: string | null;
};

function DecisionButtons({ decision }: { decision: 'approved' | 'declined' }) {
  const { pending } = useFormStatus();
  const approving = decision === 'approved';
  return (
    <Button type="submit" variant={approving ? 'primary' : 'secondary'} size="sm" disabled={pending}>
      {pending ? '…' : approving ? 'Onayla' : 'Reddet'}
    </Button>
  );
}

/**
 * One request awaiting the Chapter Head. Approving is where the meeting
 * becomes real, so it is also the only place a video link is asked for —
 * collecting it earlier would mean holding a link for a meeting that may
 * never happen.
 */
export function PendingRequestRow({ request }: { request: PendingRequest }) {
  const [url, setUrl] = useState('');

  const approve = decideMeetingRequestAction.bind(null, request.id, 'approved');
  const decline = decideMeetingRequestAction.bind(null, request.id, 'declined');
  const [approveState, approveAction] = useActionState<MeetingActionState, FormData>(approve, {});
  const [declineState, declineAction] = useActionState<MeetingActionState, FormData>(decline, {});
  const state = approveState.error || approveState.success ? approveState : declineState;

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-row)] border border-warn-line bg-warn-soft/30 p-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink">{request.title}</p>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {formatDateTr(request.startsAt)} · {formatTimeRangeTr(request.startsAt, request.endsAt)}
            {request.requestedByName ? ` · ${request.requestedByName} talep etti` : null}
          </p>
        </div>
        <StatusPill tone="warn" icon="◔">
          Onay bekliyor
        </StatusPill>
      </div>

      {request.requestNote ? (
        <p className="rounded-[10px] bg-surface px-3 py-2 text-[13px]/[1.6] text-ink-2">
          {request.requestNote}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1">
          <span className="text-[11px] font-semibold text-ink-3">
            Toplantı bağlantısı (onaylarken eklenir)
          </span>
          <Input
            name="meetingUrl"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://meet.google.com/..."
            inputMode="url"
          />
        </label>

        <form action={approveAction}>
          <input type="hidden" name="meetingUrl" value={url} />
          <DecisionButtons decision="approved" />
        </form>
        <form action={declineAction}>
          <DecisionButtons decision="declined" />
        </form>
      </div>
    </li>
  );
}
