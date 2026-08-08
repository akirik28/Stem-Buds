'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { postMessageAction, type MessageActionState } from '../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Gönder'}
    </Button>
  );
}

export function Composer({ channelId, canAnnounce, onPosted }: { channelId: string; canAnnounce: boolean; onPosted: () => void }) {
  const action = postMessageAction.bind(null, channelId, null);
  const [state, formAction] = useActionState<MessageActionState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!state.error) {
      formRef.current?.reset();
      onPosted();
    }
    // Only re-run when `state` itself changes (a fresh submission result) —
    // `onPosted` is a new function identity every render and must not
    // retrigger this on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2 border-t border-navy-100 pt-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Textarea name="body" required rows={2} maxLength={4000} placeholder="Mesajınızı yazın… (@kullaniciadi ile bahset)" />
      <div className="flex items-center justify-between">
        {canAnnounce ? (
          <label className="flex items-center gap-2 text-sm text-navy-600">
            <input type="checkbox" name="isAnnouncement" className="accent-leaf-600" />
            Duyuru olarak gönder
          </label>
        ) : (
          <span />
        )}
        <SubmitButton />
      </div>
    </form>
  );
}
