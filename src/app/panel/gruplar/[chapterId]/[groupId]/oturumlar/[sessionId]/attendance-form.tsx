'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { attendanceLabels } from '@/lib/i18n/tr';
import { finalizeAttendanceAction, type ActionState } from '../actions';

type StudentAttendance = {
  membershipId: string;
  fullName: string;
  username: string;
  currentStatus: 'present' | 'late' | 'absent' | 'excused' | null;
  currentNote: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Katılımı Kaydet'}
    </Button>
  );
}

export function AttendanceForm({
  chapterId,
  groupId,
  sessionId,
  students,
  finalized,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  students: StudentAttendance[];
  finalized: boolean;
}) {
  const action = finalizeAttendanceAction.bind(null, chapterId, groupId, sessionId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  if (students.length === 0) {
    return <p className="mt-2 text-sm text-navy-500">Bu grupta henüz öğrenci yok.</p>;
  }

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {finalized ? (
        <p className="text-xs text-navy-400">
          Katılım daha önce kaydedildi. Yeniden kaydetmek düzeltme olarak işlenir.
        </p>
      ) : null}

      {students.map((student) => (
        <div key={student.membershipId} className="flex flex-wrap items-center gap-3 rounded-lg border border-navy-100 p-3">
          <input type="hidden" name="membershipId" value={student.membershipId} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-navy-900">{student.fullName}</p>
            <p className="text-xs text-navy-500">@{student.username}</p>
          </div>
          <Select
            name={`status-${student.membershipId}`}
            defaultValue={student.currentStatus ?? 'present'}
            className="w-auto min-h-9 py-1"
            aria-label={`${student.fullName} katılım durumu`}
          >
            <option value="present">{attendanceLabels.present}</option>
            <option value="late">{attendanceLabels.late}</option>
            <option value="absent">{attendanceLabels.absent}</option>
            <option value="excused">{attendanceLabels.excused}</option>
          </Select>
        </div>
      ))}

      <SubmitButton />
    </form>
  );
}
