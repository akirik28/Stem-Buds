'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { StatusPill } from '@/components/ui/status';
import { deleteLeadershipAction, upsertLeadershipAction, type ActionState } from './actions';

export type LeadershipData = {
  id: string;
  fullName: string;
  title: string;
  bio: string;
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

export function LeadershipRow({ profile }: { profile: LeadershipData }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(upsertLeadershipAction, {});
  const [deletePending, startDelete] = useTransition();
  const [deleteState, setDeleteState] = useState<ActionState | null>(null);

  if (editing) {
    return (
      <li className="py-3">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <input type="hidden" name="id" value={profile.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ad Soyad" htmlFor={`fullName-${profile.id}`} required>
              <Input id={`fullName-${profile.id}`} name="fullName" defaultValue={profile.fullName} required minLength={2} />
            </Field>
            <Field label="Unvan" htmlFor={`title-${profile.id}`} required>
              <Input id={`title-${profile.id}`} name="title" defaultValue={profile.title} required minLength={2} />
            </Field>
          </div>
          <Field label="Biyografi" htmlFor={`bio-${profile.id}`} required>
            <Textarea id={`bio-${profile.id}`} name="bio" defaultValue={profile.bio} required minLength={2} />
          </Field>
          <div className="flex flex-wrap items-center gap-4">
            <Field label="Sıra" htmlFor={`order-${profile.id}`}>
              <Input id={`order-${profile.id}`} name="displayOrder" type="number" defaultValue={profile.displayOrder} className="w-24" />
            </Field>
            <label className="mt-6 flex items-center gap-2 text-sm text-navy-800">
              <input type="checkbox" name="isPublic" defaultChecked={profile.isPublic} className="h-4 w-4 rounded border-navy-300" />
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
            <p className="font-medium text-navy-900">{profile.fullName}</p>
            <StatusPill tone={profile.isPublic ? 'ok' : 'neutral'}>{profile.isPublic ? 'Yayında' : 'Taslak'}</StatusPill>
          </div>
          <p className="text-xs text-navy-400">{profile.title} · Sıra: {profile.displayOrder}</p>
          <p className="mt-1 text-sm text-navy-600">{profile.bio}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
          <ConfirmDeleteButton
            label="Sil"
            confirmQuestion={`"${profile.fullName}" silinsin mi?`}
            disabled={deletePending}
            onConfirm={() =>
              startDelete(async () => {
                setDeleteState(await deleteLeadershipAction(profile.id));
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
