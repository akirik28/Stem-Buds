'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { messages } from '@/lib/i18n/tr';
import { logoutAction } from '../(auth)/actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? messages.common.loading : messages.auth.logout}
    </Button>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <SubmitButton />
    </form>
  );
}
