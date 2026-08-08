'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Select } from '@/components/ui/form';
import type { ChapterMember } from '@/server/services/chapter-service';
import { addGroupMemberAction, type ActionState } from '../../actions';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Ekleniyor…' : 'Ekle'}
    </Button>
  );
}

/**
 * Adds a student to the group. Mentor assignment is deliberately a separate
 * flow (`AssignMentorForm` / `assignGroupMentor`) — it is the one that keeps
 * `groups.mentorUserId` (the authoritative pointer) in sync, so this form
 * only ever creates `student` memberships to avoid a second, unsynced path
 * to a "mentor" group membership.
 */
export function AddMemberForm({
  chapterId,
  groupId,
  candidates,
}: {
  chapterId: string;
  groupId: string;
  candidates: ChapterMember[];
}) {
  const action = addGroupMemberAction.bind(null, chapterId, groupId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-4">
      <input type="hidden" name="role" value="student" />

      {state.error ? <Alert tone="error" className="w-full">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success" className="w-full">{state.success}</Alert> : null}

      <Field label="Öğrenci" htmlFor="userId" required>
        <Select id="userId" name="userId" required defaultValue="">
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
