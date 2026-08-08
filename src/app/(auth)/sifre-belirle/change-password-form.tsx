'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { messages } from '@/lib/i18n/tr';
import { changePasswordAction, type FormState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? messages.common.saving : messages.common.save}
    </Button>
  );
}

export function ChangePasswordForm({
  requireCurrentPassword,
}: {
  requireCurrentPassword: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(changePasswordAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      {requireCurrentPassword ? (
        <Field label={messages.auth.currentPassword} htmlFor="currentPassword" required>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </Field>
      ) : null}

      <Field
        label={messages.auth.newPassword}
        htmlFor="newPassword"
        hint="En az 10 karakter, en az bir harf ve bir rakam içermeli."
        required
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          aria-describedby="newPassword-hint"
          required
          minLength={10}
          maxLength={128}
        />
      </Field>

      <Field label={messages.auth.newPasswordRepeat} htmlFor="newPasswordRepeat" required>
        <Input
          id="newPasswordRepeat"
          name="newPasswordRepeat"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
