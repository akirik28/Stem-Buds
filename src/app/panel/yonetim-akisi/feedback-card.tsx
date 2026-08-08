'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { feedbackCategoryLabels } from '@/lib/i18n/tr';
import { formatRelativeTr } from '@/lib/format';
import { markFeedbackReviewedAction } from './actions';
import type { ContinuousFeedback } from '@/server/services/feedback-service';

export function FeedbackCard({ feedback, reporterLabel }: { feedback: ContinuousFeedback; reporterLabel: string | null }) {
  const [pending, startTransition] = useTransition();
  const [reviewed, setReviewed] = useState(feedback.reviewedAt !== null);

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone="info">{feedbackCategoryLabels[feedback.category]}</StatusPill>
        {reviewed ? <StatusPill tone="ok">İncelendi</StatusPill> : null}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-navy-700">{feedback.message}</p>
      <p className="mt-1 text-xs text-navy-400">
        {formatRelativeTr(feedback.createdAt)} · {reporterLabel ?? 'Anonim'}
      </p>
      {!reviewed ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markFeedbackReviewedAction(feedback.id);
                if (!result.error) setReviewed(true);
              })
            }
          >
            İncelendi olarak işaretle
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
