'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { generateSessionsAction, type ActionState } from './actions';

export function GenerateSessionsButton({ chapterId, groupId }: { chapterId: string; groupId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await generateSessionsAction(chapterId, groupId));
          })
        }
      >
        {pending ? 'Oluşturuluyor…' : 'Oturumları Oluştur'}
      </Button>
      {result?.error ? <p className="text-xs text-red-700">{result.error}</p> : null}
      {result?.success ? <p className="text-xs text-leaf-700">{result.success}</p> : null}
    </div>
  );
}
