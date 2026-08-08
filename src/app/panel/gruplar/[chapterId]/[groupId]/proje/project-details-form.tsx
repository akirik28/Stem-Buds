'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { updateProjectDetailsAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

export function ProjectDetailsForm({
  chapterId,
  groupId,
  initial,
}: {
  chapterId: string;
  groupId: string;
  initial: {
    name: string;
    shortDescription: string;
    researchQuestion: string;
    purpose: string;
    startDate: string;
  };
}) {
  const action = updateProjectDetailsAction.bind(null, chapterId, groupId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Proje adı" htmlFor="name" required>
        <Input id="name" name="name" required minLength={2} defaultValue={initial.name} />
      </Field>
      <Field label="Kısa açıklama" htmlFor="shortDescription">
        <Textarea id="shortDescription" name="shortDescription" defaultValue={initial.shortDescription} />
      </Field>
      <Field label="Araştırma/problem sorusu" htmlFor="researchQuestion">
        <Textarea id="researchQuestion" name="researchQuestion" defaultValue={initial.researchQuestion} />
      </Field>
      <Field label="Amaç" htmlFor="purpose">
        <Textarea id="purpose" name="purpose" defaultValue={initial.purpose} />
      </Field>
      <Field label="Başlangıç tarihi" htmlFor="startDate">
        <Input id="startDate" name="startDate" type="date" defaultValue={initial.startDate} />
      </Field>

      <SubmitButton />
    </form>
  );
}
