'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import { disciplineLabels, type DisciplineKey } from '@/lib/i18n/tr';
import { createGroupAction, type ActionState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Grup oluştur'}
    </Button>
  );
}

export function CreateGroupForm({ chapterId }: { chapterId: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createGroupAction, {});
  const disciplines = Object.keys(disciplineLabels) as DisciplineKey[];

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-4">
      <input type="hidden" name="chapterId" value={chapterId} />

      {state.error ? <Alert tone="error" className="w-full">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success" className="w-full">{state.success}</Alert> : null}

      <Field label="Disiplin" htmlFor="disciplineKey" required>
        <Select id="disciplineKey" name="disciplineKey" required>
          {disciplines.map((key) => (
            <option key={key} value={key}>
              {disciplineLabels[key]}
            </option>
          ))}
        </Select>
      </Field>

      <SubmitButton />
    </form>
  );
}
