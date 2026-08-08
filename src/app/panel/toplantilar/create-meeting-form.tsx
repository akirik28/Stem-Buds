'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { createMentorMeetingAction, type MeetingActionState } from './actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Toplantı Oluştur'}
    </Button>
  );
}

export function CreateMeetingForm({ chapterId, academicYearId }: { chapterId: string; academicYearId: string }) {
  const action = createMentorMeetingAction.bind(null, chapterId, academicYearId);
  const [state, formAction] = useActionState<MeetingActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Başlık" htmlFor="meeting-title" required>
        <Input id="meeting-title" name="title" required maxLength={200} placeholder="Ekim Ayı Mentor Toplantısı" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Başlangıç" htmlFor="meeting-starts" required>
          <Input id="meeting-starts" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Bitiş" htmlFor="meeting-ends" required>
          <Input id="meeting-ends" name="endsAt" type="datetime-local" required />
        </Field>
      </div>
      <Field label="Gündem (opsiyonel)" htmlFor="meeting-agenda">
        <Textarea id="meeting-agenda" name="agenda" rows={2} />
      </Field>

      <SubmitButton />
    </form>
  );
}
