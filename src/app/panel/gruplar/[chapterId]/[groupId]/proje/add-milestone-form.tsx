'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { addMilestoneAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Ekleniyor…' : 'Milestone Ekle'}
    </Button>
  );
}

export function AddMilestoneForm({ chapterId, groupId }: { chapterId: string; groupId: string }) {
  const action = addMilestoneAction.bind(null, chapterId, groupId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3 border-t border-navy-100 pt-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Milestone başlığı" htmlFor="title" required>
        <Input id="title" name="title" required minLength={2} className="min-w-48" />
      </Field>
      <Field label="Hedef tarih" htmlFor="dueDate">
        <Input id="dueDate" name="dueDate" type="date" />
      </Field>
      <SubmitButton />
    </form>
  );
}
