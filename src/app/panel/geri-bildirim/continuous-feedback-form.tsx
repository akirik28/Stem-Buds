'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { feedbackCategoryLabels } from '@/lib/i18n/tr';
import { submitContinuousFeedbackAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Gönder'}
    </Button>
  );
}

export function ContinuousFeedbackForm({ groups }: { groups: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState<ActionState, FormData>(submitContinuousFeedbackAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Konu" htmlFor="feedback-category" required>
        <Select id="feedback-category" name="category" required defaultValue="">
          <option value="" disabled>
            Seçiniz
          </option>
          {Object.entries(feedbackCategoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      {groups.length > 0 ? (
        <Field label="İlgili grup (opsiyonel)" htmlFor="feedback-group">
          <Select id="feedback-group" name="groupId" defaultValue="">
            <option value="">Genel</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field label="Mesajınız" htmlFor="feedback-message" required>
        <Textarea id="feedback-message" name="message" required rows={4} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-navy-600">
        <input type="checkbox" name="isAnonymous" className="accent-leaf-600" />
        Anonim gönder
      </label>

      <SubmitButton />
    </form>
  );
}
