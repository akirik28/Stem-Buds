'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { createProgramMeetingAction, type MeetingActionState } from './actions';
import type { MeetingParticipantCandidate } from '@/server/services/mentor-meeting-service';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Toplantı Oluştur'}
    </Button>
  );
}

export function CreateProgramMeetingForm({
  programId,
  academicYearId,
  candidates,
}: {
  programId: string;
  academicYearId: string;
  candidates: MeetingParticipantCandidate[];
}) {
  const action = createProgramMeetingAction.bind(null, programId, academicYearId);
  const [state, formAction] = useActionState<MeetingActionState, FormData>(action, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  return (
    <form action={formAction} className="space-y-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <Field label="Başlık" htmlFor="program-meeting-title" required>
        <Input id="program-meeting-title" name="title" required maxLength={200} placeholder="Program Değerlendirme Toplantısı" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Başlangıç" htmlFor="program-meeting-starts" required>
          <Input id="program-meeting-starts" name="startsAt" type="datetime-local" required />
        </Field>
        <Field label="Bitiş" htmlFor="program-meeting-ends" required>
          <Input id="program-meeting-ends" name="endsAt" type="datetime-local" required />
        </Field>
      </div>
      <Field label="Gündem (opsiyonel)" htmlFor="program-meeting-agenda">
        <Textarea id="program-meeting-agenda" name="agenda" rows={2} />
      </Field>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-navy-700">Katılımcılar</p>
          <button
            type="button"
            className="text-xs text-navy-500 hover:underline"
            onClick={() => setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((c) => c.userId)))}
          >
            {selected.size === candidates.length ? 'Seçimi temizle' : 'Herkesi seç'}
          </button>
        </div>
        {candidates.length === 0 ? (
          <p className="mt-2 text-sm text-navy-500">Bu Program’da atanmış chapter head veya mentor bulunmuyor.</p>
        ) : (
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-navy-100 p-2">
            {candidates.map((candidate) => (
              <label key={candidate.userId} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-sand-50">
                <input
                  type="checkbox"
                  name="participantUserIds"
                  value={candidate.userId}
                  checked={selected.has(candidate.userId)}
                  onChange={() => toggle(candidate.userId)}
                  className="accent-leaf-600"
                />
                <span className="text-navy-800">{candidate.fullName}</span>
                <span className="text-xs text-navy-400">{candidate.role === 'chapter_head' ? 'Chapter Head' : 'Mentor'}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <SubmitButton />
    </form>
  );
}
