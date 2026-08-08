'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { updateProjectOutcomeAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

export function OutcomeForm({
  chapterId,
  groupId,
  initial,
}: {
  chapterId: string;
  groupId: string;
  initial: { outcomeSummary: string; finalDelivered: boolean; externalReferenceUrl: string };
}) {
  const action = updateProjectOutcomeAction.bind(null, chapterId, groupId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Proje çıktı/sonuç özeti" htmlFor="outcomeSummary">
        <Textarea id="outcomeSummary" name="outcomeSummary" defaultValue={initial.outcomeSummary} />
      </Field>
      <Field
        label="Dış referans bağlantısı"
        htmlFor="externalReferenceUrl"
        hint="Örn. Google Drive veya GitHub bağlantısı. Dosyalar platforma yüklenmez."
      >
        <Input
          id="externalReferenceUrl"
          name="externalReferenceUrl"
          type="url"
          defaultValue={initial.externalReferenceUrl}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-navy-800">
        <input
          type="checkbox"
          name="finalDelivered"
          defaultChecked={initial.finalDelivered}
          className="h-4 w-4 rounded border-navy-300"
        />
        Final proje teslim edildi ✅
      </label>

      <SubmitButton />
    </form>
  );
}
