'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { complaintCategoryLabels, complaintStatusLabels } from '@/lib/i18n/tr';
import { formatRelativeTr } from '@/lib/format';
import { setComplaintStatusAction, type AlertActionState } from './actions';
import type { Complaint } from '@/server/services/complaint-service';

const STATUS_TONE = { new: 'info', investigating: 'warn', resolved: 'ok' } as const;

/**
 * Reporter identity is only ever rendered when the server already told us
 * we're allowed to see it (`canSeeReporter`) — never inferred client-side
 * from `isAnonymous` alone, since that flag says nothing about whether
 * *this* viewer is authorized.
 */
export function ComplaintCard({
  complaint,
  reporterLabel,
  canManage,
}: {
  complaint: Complaint;
  reporterLabel: string | null;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AlertActionState | null>(null);
  const [note, setNote] = useState('');

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={STATUS_TONE[complaint.status]}>{complaintCategoryLabels[complaint.category]}</StatusPill>
            <StatusPill tone="neutral">{complaintStatusLabels[complaint.status]}</StatusPill>
          </div>
          <p className="mt-2 font-medium text-navy-900">{complaint.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-navy-600">{complaint.body}</p>
          <p className="mt-1 text-xs text-navy-400">
            {formatRelativeTr(complaint.createdAt)} · {reporterLabel ?? 'Anonim'}
          </p>
          {complaint.resolutionNote ? (
            <p className="mt-2 rounded-lg bg-leaf-50 px-3 py-2 text-sm text-leaf-800">Çözüm notu: {complaint.resolutionNote}</p>
          ) : null}
        </div>
      </div>

      {canManage && complaint.status !== 'resolved' ? (
        <div className="mt-3 space-y-2">
          {complaint.status === 'new' ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(await setComplaintStatusAction(complaint.id, 'investigating', null));
                })
              }
            >
              İnceleniyor olarak işaretle
            </Button>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Çözüm notu"
              className="min-h-9 flex-1 rounded-lg border border-navy-200 px-3 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending || note.trim().length === 0}
              onClick={() =>
                startTransition(async () => {
                  setResult(await setComplaintStatusAction(complaint.id, 'resolved', note));
                })
              }
            >
              Sonuçlandır
            </Button>
          </div>
          {result?.error ? <Alert tone="error">{result.error}</Alert> : null}
        </div>
      ) : null}
    </Card>
  );
}
