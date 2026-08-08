'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { projectHealthLabels } from '@/lib/i18n/tr';
import { updateProjectStatusAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Durumu Güncelle'}
    </Button>
  );
}

export function ProjectStatusForm({
  chapterId,
  groupId,
  currentHealth,
}: {
  chapterId: string;
  groupId: string;
  currentHealth: 'on_track' | 'attention' | 'delayed';
}) {
  const action = updateProjectStatusAction.bind(null, chapterId, groupId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Proje durumu" htmlFor="health">
        <Select id="health" name="health" defaultValue={currentHealth} className="w-auto">
          {(Object.keys(projectHealthLabels) as (keyof typeof projectHealthLabels)[]).map((key) => (
            <option key={key} value={key}>
              {projectHealthLabels[key]}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton />
    </form>
  );
}
