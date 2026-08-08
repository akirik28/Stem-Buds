'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import {
  archiveGroupAction,
  deleteGroupAction,
  reactivateGroupAction,
  type ActionState,
} from '../../actions';

export function GroupLifecycleControls({
  chapterId,
  groupId,
  isActive,
  isEmpty,
}: {
  chapterId: string;
  groupId: string;
  isActive: boolean;
  isEmpty: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      setResult(await action());
      setConfirmingArchive(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {isActive ? (
          confirmingArchive ? (
            <>
              <span className="text-xs text-navy-500">Bu grup pasifleştirilsin mi?</span>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => run(() => archiveGroupAction(chapterId, groupId))}
              >
                Evet, Pasifleştir
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingArchive(false)}>
                Vazgeç
              </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setConfirmingArchive(true)}>
              Pasifleştir
            </Button>
          )
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => reactivateGroupAction(chapterId, groupId))}
          >
            Yeniden Aktifleştir
          </Button>
        )}
        {isEmpty ? (
          <ConfirmDeleteButton
            label="Grubu Sil"
            confirmQuestion="Bu grup kalıcı olarak silinsin mi? Bu işlem geri alınamaz."
            disabled={pending}
            onConfirm={() => run(() => deleteGroupAction(chapterId, groupId))}
          />
        ) : null}
      </div>
      {result?.error ? <Alert tone="error">{result.error}</Alert> : null}
      {result?.success ? <Alert tone="success">{result.success}</Alert> : null}
    </div>
  );
}
