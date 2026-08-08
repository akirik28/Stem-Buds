'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { meetingAttendanceLabels } from '@/lib/i18n/tr';
import { setAttendanceAction, type MeetingActionState } from '../actions';

type MentorOption = { userId: string; fullName: string; username: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Katılımı Kaydet'}
    </Button>
  );
}

export function AttendanceForm({
  meetingId,
  mentors,
  existing,
}: {
  meetingId: string;
  mentors: MentorOption[];
  existing: Map<string, 'present' | 'absent' | 'excused'>;
}) {
  const action = setAttendanceAction.bind(
    null,
    meetingId,
    mentors.map((m) => m.userId),
  );
  const [state, formAction] = useActionState<MeetingActionState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      {mentors.length === 0 ? (
        <p className="text-sm text-navy-500">Bu chapter’a atanmış mentor bulunmuyor.</p>
      ) : (
        <div className="space-y-2">
          {mentors.map((mentor) => (
            <div key={mentor.userId} className="flex items-center justify-between gap-3">
              <span className="text-sm text-navy-700">{mentor.fullName}</span>
              <Select name={`status-${mentor.userId}`} defaultValue={existing.get(mentor.userId) ?? 'present'} className="w-40">
                {Object.entries(meetingAttendanceLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
          ))}
        </div>
      )}

      {mentors.length > 0 ? <SubmitButton /> : null}
    </form>
  );
}
