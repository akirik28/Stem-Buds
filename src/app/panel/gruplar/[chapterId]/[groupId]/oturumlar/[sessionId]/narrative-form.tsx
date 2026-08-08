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
    outputs: string;
    problems: string;
    nextWeekGoal: string;
    projectHealth: string;
  };
}) {
  const action = updateNarrativeAction.bind(null, chapterId, groupId, sessionId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Bu hafta projede ne yaptınız?" htmlFor="whatWeDid" required>
        <Textarea id="whatWeDid" name="whatWeDid" required defaultValue={initial.whatWeDid} rows={3} />
      </Field>

      <Field label="Bu hafta çıkan sonuç/çıktılar" htmlFor="outputs">
        <Textarea id="outputs" name="outputs" defaultValue={initial.outputs} rows={2} />
      </Field>

      <Field label="Karşılaşılan problem" htmlFor="problems">
        <Textarea id="problems" name="problems" defaultValue={initial.problems} rows={2} />
      </Field>

      <Field label="Gelecek hafta hedefiniz" htmlFor="nextWeekGoal" required>
        <Textarea id="nextWeekGoal" name="nextWeekGoal" required defaultValue={initial.nextWeekGoal} rows={2} />
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
