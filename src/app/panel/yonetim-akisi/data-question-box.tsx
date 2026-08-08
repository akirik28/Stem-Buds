'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { AiInsightCard } from '@/components/ui/ai-insight-card';
import { askDataQuestionAction, type AiActionState } from './actions';

const EXAMPLE_QUESTIONS = [
  'Bu hafta hangi gruplara bakmalıyım?',
  'Son üç haftada kötüleşen gruplar hangileri?',
  '14 güne yaklaşan güncellenmemiş projeler hangileri?',
];

/** "Verilere Sor" — REGIONAL_DIRECTOR / VICE_DIRECTOR only. Bounded, cached-by-question. */
export function DataQuestionBox({ programId }: { programId: string | null }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<AiActionState | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <p className="text-xs text-navy-500">Örnekler: {EXAMPLE_QUESTIONS.join(' · ')}</p>
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Örn. Bu hafta hangi gruplara bakmalıyım?"
        maxLength={300}
        rows={2}
      />
      <Button
        type="button"
        disabled={pending || question.trim().length === 0}
        onClick={() =>
          startTransition(async () => {
            setResult(await askDataQuestionAction(question, programId));
          })
        }
      >
        {pending ? 'Yanıtlanıyor…' : 'Sor'}
      </Button>

      {result ? (
        result.status === 'ok' ? (
          <AiInsightCard insight={result.insight} />
        ) : (
          <Alert tone={result.status === 'error' ? 'error' : 'info'}>{result.message}</Alert>
        )
      ) : null}
    </div>
  );
}
