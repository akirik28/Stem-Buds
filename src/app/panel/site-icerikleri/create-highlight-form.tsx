'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { upsertHighlightAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Ekleniyor…' : 'Ekle'}
    </Button>
  );
}

export function CreateHighlightForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(upsertHighlightAction, {});

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        + Yeni Öne Çıkan İçerik
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-navy-100 p-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Anahtar" htmlFor="new-highlight-key" hint="Benzersiz, örn. impact-2026" required>
          <Input id="new-highlight-key" name="key" required minLength={2} />
        </Field>
        <Field label="Başlık" htmlFor="new-highlight-title" required>
          <Input id="new-highlight-title" name="title" required minLength={2} />
        </Field>
      </div>
      <Field label="İçerik" htmlFor="new-highlight-body" required>
        <Textarea id="new-highlight-body" name="body" required minLength={2} />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Field label="Sıra" htmlFor="new-highlight-order">
          <Input id="new-highlight-order" name="displayOrder" type="number" defaultValue={0} className="w-24" />
        </Field>
        <label className="mt-6 flex items-center gap-2 text-sm text-navy-800">
          <input type="checkbox" name="isPublic" className="h-4 w-4 rounded border-navy-300" />
          Sitede göster
        </label>
      </div>
      <div className="flex gap-2">
        <SubmitButton />
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}
