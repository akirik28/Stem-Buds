'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { complaintCategoryLabels } from '@/lib/i18n/tr';
import { submitComplaintAction, type ActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Şikâyeti Gönder'}
    </Button>
  );
}

export function ComplaintForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(submitComplaintAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Kategori" htmlFor="complaint-category" required>
        <Select id="complaint-category" name="category" required defaultValue="">
          <option value="" disabled>
            Seçiniz
          </option>
          {Object.entries(complaintCategoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Konu" htmlFor="complaint-subject" required>
        <Input id="complaint-subject" name="subject" required maxLength={200} />
      </Field>

      <Field label="Açıklama" htmlFor="complaint-body" required>
        <Textarea id="complaint-body" name="body" required rows={4} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-navy-600">
        <input type="checkbox" name="isAnonymous" className="accent-leaf-600" />
        Anonim gönder
      </label>
      <p className="text-xs text-navy-400">
        Şikâyetiniz gizli tutulur; yalnızca Chapter Head veya üst yönetim görüntüleyebilir. &ldquo;Chapter Head ile
        ilgili&rdquo; kategorisi seçildiğinde şikâyet yalnızca üst yönetime iletilir.
      </p>

      <SubmitButton />
    </form>
  );
}
