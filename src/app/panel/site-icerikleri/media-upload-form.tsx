'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { uploadMediaAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Yükleniyor…' : 'Yükle'}
    </Button>
  );
}

export function MediaUploadForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadMediaAction, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-b border-navy-100 pb-4">
      {state.error ? (
        <Alert tone="error" className="w-full">
          {state.error}
        </Alert>
      ) : null}
      <Field label="Görsel" htmlFor="media-file" hint="JPEG, PNG, WEBP veya GIF · en fazla 4 MB" required>
        <Input id="media-file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required />
      </Field>
      <Field label="Alternatif metin" htmlFor="media-altText" required>
        <Input id="media-altText" name="altText" required minLength={2} className="min-w-56" />
      </Field>
      <SubmitButton />
    </form>
  );
}
