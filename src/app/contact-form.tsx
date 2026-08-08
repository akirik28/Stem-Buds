'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { contactReasonLabels } from '@/lib/i18n/tr';
import { submitContactFormAction, type ContactFormState } from './contact-actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Gönder'}
    </Button>
  );
}

export function ContactForm() {
  const [state, formAction] = useActionState<ContactFormState, FormData>(submitContactFormAction, {});

  if (state.success) {
    return (
      <div className="rounded-2xl bg-white/10 p-6 ring-1 ring-inset ring-white/20">
        <Alert tone="success">Mesajınız iletildi. En kısa sürede size dönüş yapacağız.</Alert>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-2xl bg-white p-6 text-navy-900">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <Field label="Ad Soyad" htmlFor="contact-fullName" required>
        <Input id="contact-fullName" name="fullName" required maxLength={160} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-posta" htmlFor="contact-email" required>
          <Input id="contact-email" name="email" type="email" required maxLength={254} />
        </Field>
        <Field label="Telefon (opsiyonel)" htmlFor="contact-phone">
          <Input id="contact-phone" name="phone" type="tel" maxLength={32} />
        </Field>
      </div>
      <Field label="Konu" htmlFor="contact-reason" required>
        <Select id="contact-reason" name="reason" required defaultValue="">
          <option value="" disabled>
            Seçiniz
          </option>
          {Object.entries(contactReasonLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Mesajınız" htmlFor="contact-message" required>
        <Textarea id="contact-message" name="message" required rows={4} maxLength={4000} />
      </Field>

      <SubmitButton />
    </form>
  );
}
