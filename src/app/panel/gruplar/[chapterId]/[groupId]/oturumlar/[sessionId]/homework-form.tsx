'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { setHomeworkAction, type ActionState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Ödevi Kaydet'}
    </Button>
  );
}

export function HomeworkForm({
  chapterId,
  groupId,
  sessionId,
  initial,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  initial: { noHomework: boolean; description: string; dueDate: string };
}) {
  const action = setHomeworkAction.bind(null, chapterId, groupId, sessionId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [noHomework, setNoHomework] = useState(initial.noHomework);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <label className="flex items-center gap-2 text-sm text-navy-700">
        <input
          type="checkbox"
          name="noHomework"
          checked={noHomework}
          onChange={(e) => setNoHomework(e.target.checked)}
          className="h-4 w-4 rounded border-navy-300"
        />
        Bu hafta ödev yok.
      </label>

      {!noHomework ? (
        <>
          <Field label="Bu haftanın ödevi nedir?" htmlFor="description" required>
            <Textarea id="description" name="description" defaultValue={initial.description} rows={3} />
          </Field>
          <Field label="Son teslim tarihi" htmlFor="dueDate" hint="Boş bırakılırsa gelecek oturum tarihi kullanılır">
            <Input id="dueDate" name="dueDate" type="date" defaultValue={initial.dueDate} />
          </Field>
        </>
      ) : null}

      <SubmitButton />
    </form>
  );
}
