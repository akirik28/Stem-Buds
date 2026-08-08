'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AiInsightCard } from '@/components/ui/ai-insight-card';
import type { AiActionState } from './actions';

/**
 * Shared client shell for every cached AI card on this page: shows the
 * server-rendered initial result, and offers a rate-limited "Yeniden
 * değerlendir" action that calls back into the exact same authorized server
 * action — never a client-side AI call, never a raw fetch to Groq.
 */
export function AiInsightSurface({
  initial,
  onRegenerate,
  title,
}: {
  initial: AiActionState;
  onRegenerate: () => Promise<AiActionState>;
  title: string;
}) {
  const [state, setState] = useState<AiActionState>(initial);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {state.status === 'ok' ? (
        <AiInsightCard insight={state.insight} />
      ) : (
        <Alert tone={state.status === 'error' ? 'error' : 'info'}>{state.message}</Alert>
      )}
      <div className="mt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setState(await onRegenerate());
            })
          }
        >
          {pending ? 'Oluşturuluyor…' : `${title} — Yeniden değerlendir`}
        </Button>
      </div>
    </div>
  );
}
