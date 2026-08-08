'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { createAcademicYearAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Akademik yıl oluştur'}
    </Button>
  );
}

export function CreateAcademicYearForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createAcademicYearAction, {});

  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-4">
      {state.error ? <Alert tone="error" className="sm:col-span-4">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success" className="sm:col-span-4">{state.success}</Alert> : null}

      <Field label="Etiket" htmlFor="label" required hint="Örn. 2026–2027">
        <Input id="label" name="label" required maxLength={32} />
      </Field>
      <Field label="Başlangıç" htmlFor="startDate" required>
        <Input id="startDate" name="startDate" type="date" required />
      </Field>
      <Field label="Bitiş" htmlFor="endDate" required>
        <Input id="endDate" name="endDate" type="date" required />
      </Field>
      <div className="flex items-end gap-2">
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" name="activate" className="h-4 w-4 rounded border-navy-300" />
          Aktif yap
        </label>
      </div>
      <div className="sm:col-span-4">
        <SubmitButton />
      </div>
    </form>
  );
}
