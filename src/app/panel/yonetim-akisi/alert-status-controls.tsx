'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { setAlertStatusAction, type AlertActionState } from './actions';

export function AlertStatusControls({ alertId, status }: { alertId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AlertActionState | null>(null);

  if (status !== 'new' && status !== 'investigating') return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {status === 'new' ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setResult(await setAlertStatusAction(alertId, 'investigating'));
            })
          }
        >
          İnceleniyor olarak işaretle
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setResult(await setAlertStatusAction(alertId, 'closed'));
          })
        }
      >
        Kapat
      </Button>
      {result?.error ? (
        <Alert tone="error" className="w-full">
          {result.error}
        </Alert>
      ) : null}
    </div>
  );
}
