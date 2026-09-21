'use client';

import { useActionState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { sendParentMessageAction, setMonthlyDigestAction, type ParentActionState } from './actions';

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : label}
    </Button>
  );
}

/**
 * One of the parent's two outbound messages. Both reach the Vice President
 * and the chapter's head — never the mentor, who is a high-school student
 * running a group, and never the group's own channel.
 */
export function ParentMessageForm({
  studentUserId,
  kind,
  label,
  placeholder,
  helper,
}: {
  studentUserId: string;
  kind: 'question' | 'excuse';
  label: string;
  placeholder: string;
  helper: string;
}) {
  const action = sendParentMessageAction.bind(null, studentUserId, kind);
  const [state, formAction] = useActionState<ParentActionState, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <p className="text-[12.5px]/[1.6] text-ink-3">{helper}</p>

      <Field label={label} htmlFor={`parent-${kind}`} required>
        <Textarea id={`parent-${kind}`} name="body" rows={3} required maxLength={2000} placeholder={placeholder} />
      </Field>

      <SubmitButton label={kind === 'excuse' ? 'Mazereti Bildir' : 'Soruyu İlet'} />
    </form>
  );
}

/** The monthly summary e-mail switch, per child. */
export function MonthlyDigestToggle({
  studentUserId,
  enabled,
  childName,
}: {
  studentUserId: string;
  enabled: boolean;
  childName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-row)] border border-line bg-surface-2 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink">Aylık bilgilendirme e-postası</p>
        <p className="text-[12px] text-ink-3">{childName} için ayda bir katılım ve proje özeti gönderilsin.</p>
      </div>
      <Button
        type="button"
        variant={enabled ? 'secondary' : 'primary'}
        size="sm"
        disabled={pending}
        onClick={() => startTransition(async () => { await setMonthlyDigestAction(studentUserId, !enabled); })}
      >
        {pending ? '…' : enabled ? 'Kapat' : 'Aç'}
      </Button>
    </div>
  );
}
