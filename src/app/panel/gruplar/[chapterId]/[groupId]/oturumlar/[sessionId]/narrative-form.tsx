'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/form';
import { projectHealthLabels } from '@/lib/i18n/tr';
import { updateNarrativeAction, type ActionState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Raporu Kaydet'}
    </Button>
  );
}

export function NarrativeForm({
  chapterId,
  groupId,
  sessionId,
  initial,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  initial: {
    whatWeDid: string;
    projectHealth: string;
  };
}) {
  const action = updateNarrativeAction.bind(null, chapterId, groupId, sessionId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-3.5 space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      {/* One box, not five. The five separate prompts asked a mentor to
          slice one week into "what we did", "outputs", "problems" and "next
          week" before they could write anything, and most of the boxes came
          back empty. One prompt that names all four gets the same facts in
          the order the mentor actually remembers them. */}
      <Field
        label="Bu hafta ne oldu?"
        htmlFor="whatWeDid"
        hint="Ne yaptınız, ne çıktı, takıldığınız bir şey var mı, gelecek hafta ne yapacaksınız — hepsini buraya yazın."
        required
      >
        <Textarea id="whatWeDid" name="whatWeDid" required defaultValue={initial.whatWeDid} rows={6} />
      </Field>

      <Field label="Proje durumu" htmlFor="projectHealth" required>
        <Select id="projectHealth" name="projectHealth" required defaultValue={initial.projectHealth}>
          <option value="" disabled>
            Seçiniz
          </option>
          <option value="on_track">🟢 {projectHealthLabels.on_track}</option>
          <option value="attention">🟡 {projectHealthLabels.attention}</option>
          <option value="delayed">🔴 {projectHealthLabels.delayed}</option>
        </Select>
      </Field>

      <SubmitButton />
    </form>
  );
}
