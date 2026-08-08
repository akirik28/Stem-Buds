'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { updateMeetingNotesAction, type MeetingActionState } from '../actions';
import type { MentorMeeting } from '@/server/services/mentor-meeting-service';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

export function NotesForm({ meeting }: { meeting: MentorMeeting }) {
  const action = updateMeetingNotesAction.bind(null, meeting.id);
  const [state, formAction] = useActionState<MeetingActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Görüşülen konular" htmlFor="discussionTopics">
        <Textarea id="discussionTopics" name="discussionTopics" rows={3} defaultValue={meeting.discussionTopics ?? ''} />
      </Field>
      <Field label="Grup değerlendirmeleri" htmlFor="groupEvaluations">
        <Textarea id="groupEvaluations" name="groupEvaluations" rows={3} defaultValue={meeting.groupEvaluations ?? ''} />
      </Field>
      <Field label="Kararlar" htmlFor="decisions">
        <Textarea id="decisions" name="decisions" rows={3} defaultValue={meeting.decisions ?? ''} />
      </Field>
      <Field label="Notlar" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={2} defaultValue={meeting.notes ?? ''} />
      </Field>
      <Field label="Sonraki toplantı tarihi" htmlFor="nextMeetingDate">
        <Input id="nextMeetingDate" name="nextMeetingDate" type="date" defaultValue={meeting.nextMeetingDate ?? ''} />
      </Field>

      <SubmitButton />
    </form>
  );
}
