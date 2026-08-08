'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { createChapterAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Chapter oluştur'}
    </Button>
  );
}

export function CreateChapterForm({ programs }: { programs: { id: string; label: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createChapterAction, {});

  return (
    <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
      {state.error ? <Alert tone="error" className="sm:col-span-2">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success" className="sm:col-span-2">{state.success}</Alert> : null}

      <Field label="Program" htmlFor="programId" required>
        <Select id="programId" name="programId" required>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Chapter kodu" htmlFor="code" required hint="Örn. UAA">
        <Input id="code" name="code" required maxLength={16} />
      </Field>

      <Field label="Chapter adı" htmlFor="name" required>
        <Input id="name" name="name" required maxLength={160} />
      </Field>

      <Field label="Şehir" htmlFor="city">
        <Input id="city" name="city" maxLength={80} />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
