'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { reportIssueAction, type IssueActionState } from './issue-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Gönder'}
    </Button>
  );
}

/**
 * One box. No category, no severity, no "who should handle this" — the
 * person reporting knows what is wrong, and making them classify it first
 * produces worse data than a sentence does. Everything needed to route it,
 * the platform already knows.
 */
export function IssueBox({ groupId }: { groupId: string }) {
  const action = reportIssueAction.bind(null, groupId);
  const [state, formAction] = useActionState<IssueActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-3.5 space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field
        label="Ne oldu?"
        htmlFor="issueBody"
        hint="Kendi cümlelerinle yaz. Önce mentöre gider; çözülmezse sırasıyla chapter sorumlusuna, başkan yardımcısına iletilir."
        required
      >
        <Textarea id="issueBody" name="body" required rows={4} />
      </Field>

      <SubmitButton />
    </form>
  );
}
