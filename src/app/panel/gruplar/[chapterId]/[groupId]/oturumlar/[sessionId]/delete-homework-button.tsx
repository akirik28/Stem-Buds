'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { deleteHomeworkAction, type ActionState } from '../actions';

export function DeleteHomeworkButton({
  chapterId,
  groupId,
  sessionId,
  assignmentId,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  assignmentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  return (
    <div className="mt-2">
      <ConfirmDeleteButton
        label="Ödevi Sil"
        confirmQuestion="Bu ödev silinsin mi?"
        disabled={pending}
        onConfirm={() =>
          startTransition(async () => {
            setResult(await deleteHomeworkAction(chapterId, groupId, sessionId, assignmentId));
          })
        }
      />
      {result?.error ? (
        <Alert tone="error" className="mt-2">
          {result.error}
        </Alert>
      ) : null}
    </div>
  );
}
