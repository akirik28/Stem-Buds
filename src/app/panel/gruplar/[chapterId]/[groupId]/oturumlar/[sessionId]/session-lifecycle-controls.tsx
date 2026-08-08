'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { cancelSessionAction, deleteSessionAction, type ActionState } from '../actions';

export function SessionLifecycleControls({
  chapterId,
  groupId,
  sessionId,
  canDelete,
  canCancel,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  canDelete: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  if (!canDelete && !canCancel) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canCancel ? (
          confirmingCancel ? (
            <>
              <span className="text-xs text-navy-500">Bu oturum iptal edilsin mi?</span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setResult(await cancelSessionAction(chapterId, groupId, sessionId));
                  })
                }
              >
                Evet, İptal Et
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)}>
                Vazgeç
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setConfirmingCancel(true)}>
              Oturumu İptal Et
            </Button>
          )
        ) : null}
        {canDelete ? (
          <ConfirmDeleteButton
            label="Oturumu Sil"
            confirmQuestion="Bu oturum kalıcı olarak silinsin mi?"
            disabled={pending}
            onConfirm={() =>
              startTransition(async () => {
                const outcome = await deleteSessionAction(chapterId, groupId, sessionId);
                if (!outcome.error) {
                  router.push(`/panel/gruplar/${chapterId}/${groupId}`);
                  return;
                }
                setResult(outcome);
              })
            }
          />
        ) : null}
      </div>
      {result?.error ? <Alert tone="error">{result.error}</Alert> : null}
    </div>
  );
}
