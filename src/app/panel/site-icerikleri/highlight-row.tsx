'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { StatusPill } from '@/components/ui/status';
import { deleteHighlightAction, upsertHighlightAction, type ActionState } from './actions';

export type HighlightData = {
  id: string;
  key: string;
  title: string;
  body: string;
  displayOrder: number;
  isPublic: boolean;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

export function HighlightRow({ highlight }: { highlight: HighlightData }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(upsertHighlightAction, {});
  const [deletePending, startDelete] = useTransition();
  const [deleteState, setDeleteState] = useState<ActionState | null>(null);

  if (editing) {
    return (
      <li className="py-3">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <input type="hidden" name="id" value={highlight.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Anahtar" htmlFor={`key-${highlight.id}`} required>
              <Input id={`key-${highlight.id}`} name="key" defaultValue={highlight.key} required minLength={2} />
            </Field>
            <Field label="Başlık" htmlFor={`title-${highlight.id}`} required>
              <Input id={`title-${highlight.id}`} name="title" defaultValue={highlight.title} required minLength={2} />
            </Field>
          </div>
          <Field label="İçerik" htmlFor={`body-${highlight.id}`} required>
            <Textarea id={`body-${highlight.id}`} name="body" defaultValue={highlight.body} required minLength={2} />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <Field label="Sıra" htmlFor={`order-${highlight.id}`}>
              <Input id={`order-${highlight.id}`} name="displayOrder" type="number" defaultValue={highlight.displayOrder} className="w-24" />
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm text-navy-800">
              <input type="checkbox" name="isPublic" defaultChecked={highlight.isPublic} className="h-4 w-4 rounded border-navy-300" />
              Sitede göster
            </label>
          </div>
          <div className="flex gap-2">
            <SubmitButton />
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-navy-900">{highlight.title}</p>
            <StatusPill tone={highlight.isPublic ? 'ok' : 'neutral'}>{highlight.isPublic ? 'Yayında' : 'Taslak'}</StatusPill>
          </div>
          <p className="text-xs text-navy-400">Anahtar: {highlight.key} · Sıra: {highlight.displayOrder}</p>
          <p className="mt-1 text-sm text-navy-600">{highlight.body}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
          <ConfirmDeleteButton
            label="Sil"
            confirmQuestion={`"${highlight.title}" silinsin mi?`}
            disabled={deletePending}
            onConfirm={() =>
              startDelete(async () => {
                setDeleteState(await deleteHighlightAction(highlight.id));
              })
            }
          />
        </div>
      </div>
      {deleteState?.error ? (
        <Alert tone="error" className="mt-2">
          {deleteState.error}
        </Alert>
      ) : null}
    </li>
  );
}
