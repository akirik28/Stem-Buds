'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { StatusPill } from '@/components/ui/status';
import { formatShortDateTr } from '@/lib/format';
import { milestoneStatusLabels } from '@/lib/i18n/tr';
import { deleteMilestoneAction, updateMilestoneStatusAction, type ActionState } from './actions';

export type MilestoneRowData = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: 'planned' | 'in_progress' | 'completed';
};

const TONE = {
  planned: 'neutral',
  in_progress: 'info',
  completed: 'ok',
} as const;

const NEXT_STATUS: Record<MilestoneRowData['status'], MilestoneRowData['status'] | null> = {
  planned: 'in_progress',
  in_progress: 'completed',
  completed: null,
};

const NEXT_LABEL: Record<MilestoneRowData['status'], string> = {
  planned: 'Başlat',
  in_progress: 'Tamamlandı Olarak İşaretle',
  completed: '',
};

export function MilestoneRow({
  chapterId,
  groupId,
  milestone,
  canManage,
  canDelete,
}: {
  chapterId: string;
  groupId: string;
  milestone: MilestoneRowData;
  canManage: boolean;
  canDelete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  const isOverdue =
    milestone.status !== 'completed' && milestone.dueDate !== null && new Date(milestone.dueDate) < new Date();

  const next = NEXT_STATUS[milestone.status];

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-navy-900">{milestone.title}</p>
          {milestone.description ? <p className="text-sm text-navy-500">{milestone.description}</p> : null}
          {milestone.dueDate ? (
            <p className="text-xs text-navy-400">Hedef: {formatShortDateTr(milestone.dueDate)}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isOverdue ? (
            <StatusPill tone="danger" icon="⏰">
              Gecikti
            </StatusPill>
          ) : (
            <StatusPill tone={TONE[milestone.status]}>{milestoneStatusLabels[milestone.status]}</StatusPill>
          )}
          {canManage && next ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setResult(await updateMilestoneStatusAction(chapterId, groupId, milestone.id, next));
                })
              }
            >
              {NEXT_LABEL[milestone.status]}
            </Button>
          ) : null}
          {canDelete ? (
            <ConfirmDeleteButton
              label="Sil"
              confirmQuestion={`"${milestone.title}" silinsin mi?`}
              disabled={pending}
              onConfirm={() =>
                startTransition(async () => {
                  setResult(await deleteMilestoneAction(chapterId, groupId, milestone.id));
                })
              }
            />
          ) : null}
        </div>
      </div>
      {result?.error ? (
        <Alert tone="error" className="mt-2">
          {result.error}
        </Alert>
      ) : null}
    </li>
  );
}
