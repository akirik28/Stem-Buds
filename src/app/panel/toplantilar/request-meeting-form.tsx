'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { requestMentorMeetingAction, type MeetingActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Talebi Gönder'}
    </Button>
  );
}

/**
 * The Mentor's side of the meeting workflow. Deliberately worded as a
 * request, not a booking: the slot here is a proposal, and the Chapter Head
 * is the one who turns it into something in everyone's week.
 */
export function RequestMeetingForm({
  chapterId,
  academicYearId,
}: {
  chapterId: string;
  academicYearId: string;
}) {
  const action = requestMentorMeetingAction.bind(null, chapterId, academicYearId);
  const [state, formAction] = useActionState<MeetingActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <p className="text-[12.5px]/[1.6] text-ink-3">
        Toplantıyı Chapter Head planlar. Aşağıdaki saat bir öneridir; onaylandığında toplantı
        listesine düşer ve bağlantısı eklenir.
      </p>

      <Field label="Başlık" htmlFor="request-title" required>
        <Input
          id="request-title"
          name="title"
          required
          maxLength={200}
          placeholder="Bio 1 proje ilerlemesi"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Önerilen başlangıç" htmlFor="request-starts" required>
          <Input id="request-starts" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Önerilen bitiş" htmlFor="request-ends" required>
          <Input id="request-ends" name="endsAt" type="datetime-local" required />
        </Field>
      </div>

      <Field label="Neden toplanmak istiyorsunuz? (opsiyonel)" htmlFor="request-note">
        <Textarea
          id="request-note"
          name="requestNote"
          rows={2}
          maxLength={1000}
          placeholder="Grupta ölçüm yöntemi konusunda tıkandık, birlikte bakmak istiyoruz."
        />
      </Field>

      <SubmitButton />
    </form>
  );
}
