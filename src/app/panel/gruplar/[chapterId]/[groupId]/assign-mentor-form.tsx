'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import type { ChapterMember } from '@/server/services/chapter-service';
import { assignGroupMentorAction, type ActionState } from '../../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Atanıyor…' : 'Mentor ata'}
    </Button>
  );
}

export function AssignMentorForm({
  chapterId,
  groupId,
  candidates,
}: {
  chapterId: string;
  groupId: string;
  candidates: ChapterMember[];
}) {
  const action = assignGroupMentorAction.bind(null, chapterId, groupId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-4">
      {state.error ? <Alert tone="error" className="w-full">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success" className="w-full">{state.success}</Alert> : null}

      <Field label="Mentor" htmlFor="mentorUserId" required>
        <Select id="mentorUserId" name="mentorUserId" required defaultValue="">
          <option value="" disabled>
            Seçiniz
          </option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.fullName} (@{candidate.username})
            </option>
          ))}
        </Select>
      </Field>

      <SubmitButton />
    </form>
  );
}
