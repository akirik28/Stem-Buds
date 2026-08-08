'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { homeworkStatusLabels } from '@/lib/i18n/tr';
import { finalizePreviousHomeworkAction, type ActionState } from '../actions';

type StudentHomework = {
  membershipId: string;
  fullName: string;
  username: string;
  currentStatus: string;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Sonuçları Kaydet'}
    </Button>
  );
}

export function PreviousHomeworkForm({
  chapterId,
  groupId,
  sessionId,
  students,
  finalized,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  students: StudentHomework[];
  finalized: boolean;
}) {
  const action = finalizePreviousHomeworkAction.bind(null, chapterId, groupId, sessionId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  if (students.length === 0) return null;

  return (
    <form action={formAction} className="mt-4 space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {finalized ? <p className="text-xs text-navy-400">Sonuçlar daha önce kaydedildi.</p> : null}

      {students.map((student) => (
        <div key={student.membershipId} className="flex flex-wrap items-center gap-3 rounded-lg border border-navy-100 p-3">
          <input type="hidden" name="membershipId" value={student.membershipId} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-navy-900">{student.fullName}</p>
            <p className="text-xs text-navy-500">@{student.username}</p>
          </div>
          <Select
            name={`status-${student.membershipId}`}
            defaultValue={student.currentStatus === 'pending' ? 'not_done' : student.currentStatus}
            className="w-auto min-h-9 py-1"
            aria-label={`${student.fullName} ödev durumu`}
          >
            <option value="done">{homeworkStatusLabels.done}</option>
            <option value="not_done">{homeworkStatusLabels.not_done}</option>
            <option value="excused">{homeworkStatusLabels.excused}</option>
          </Select>
        </div>
      ))}

      <SubmitButton />
    </form>
  );
}
