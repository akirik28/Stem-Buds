'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { createNewsAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Haber Oluştur'}
    </Button>
  );
}

export function CreateNewsForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(createNewsAction, {});

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + Yeni Haber
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-navy-100 p-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Field label="Başlık" htmlFor="new-news-title" required>
        <Input id="new-news-title" name="title" required minLength={2} />
      </Field>
      <Field label="Özet" htmlFor="new-news-summary" hint="Haber listesinde görünür" required>
        <Textarea id="new-news-summary" name="summary" required minLength={2} rows={2} />
      </Field>
      <Field label="İçerik" htmlFor="new-news-body" required>
        <Textarea id="new-news-body" name="body" required minLength={2} rows={8} />
      </Field>
      <div className="flex gap-2">
        <SubmitButton />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
