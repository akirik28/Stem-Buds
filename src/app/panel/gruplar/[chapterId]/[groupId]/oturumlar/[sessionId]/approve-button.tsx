'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { approveSessionAction, type ActionState } from '../actions';

export function ApproveButton({
  chapterId,
  groupId,
  sessionId,
  alreadyApproved,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  alreadyApproved: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  if (alreadyApproved) {
    return (
      <Card>
        <p className="text-sm font-medium text-leaf-700">✅ Mentor tarafından onaylandı.</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="mb-3 text-sm text-navy-600">
        Tüm gereklilikler tamamlandığında oturumu onaylayarak haftayı kapatabilirsiniz.
      </p>
      {result?.error ? <Alert tone="error" className="mb-3">{result.error}</Alert> : null}
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await approveSessionAction(chapterId, groupId, sessionId));
          })
        }
      >
        {pending ? 'Onaylanıyor…' : 'Oturumu Onayla'}
      </Button>
    </Card>
  );
}
