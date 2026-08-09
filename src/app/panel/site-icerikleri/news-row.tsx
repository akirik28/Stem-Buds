'use client';

import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { Field, Input, Textarea } from '@/components/ui/form';
import { StatusPill } from '@/components/ui/status';
import { formatDateTimeTr } from '@/lib/format';
import { deleteNewsAction, setNewsPublishedAction, updateNewsAction, type ActionState } from './actions';

export type NewsData = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  isPublished: boolean;
  publishedAt: string | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

export function NewsRow({ post }: { post: NewsData }) {
  const [editing, setEditing] = useState(false);
  const updateAction = updateNewsAction.bind(null, post.id);
  const [state, formAction] = useActionState<ActionState, FormData>(updateAction, {});
  const [pending, startTransition] = useTransition();
  const [rowState, setRowState] = useState<ActionState | null>(null);

  if (editing) {
    return (
      <li className="py-3">
        <form action={formAction} className="space-y-3">
          {state.error ? <Alert tone="error">{state.error}</Alert> : null}
          <Field label="Başlık" htmlFor={`news-title-${post.id}`} required>
            <Input id={`news-title-${post.id}`} name="title" defaultValue={post.title} required minLength={2} />
          </Field>
          <Field label="Özet" htmlFor={`news-summary-${post.id}`} required>
            <Textarea id={`news-summary-${post.id}`} name="summary" defaultValue={post.summary} required minLength={2} rows={2} />
          </Field>
          <Field label="İçerik" htmlFor={`news-body-${post.id}`} required>
            <Textarea id={`news-body-${post.id}`} name="body" defaultValue={post.body} required minLength={2} rows={8} />
          </Field>
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
            <p className="font-medium text-navy-900">{post.title}</p>
            <StatusPill tone={post.isPublished ? 'ok' : 'neutral'}>{post.isPublished ? 'Yayında' : 'Taslak'}</StatusPill>
          </div>
          <p className="text-xs text-navy-400">
            /haberler/{post.slug}
            {post.publishedAt ? ` · ${formatDateTimeTr(post.publishedAt)}` : ''}
          </p>
          <p className="mt-1 text-sm text-navy-600">{post.summary}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setRowState(await setNewsPublishedAction(post.id, !post.isPublished));
              })
            }
          >
            {post.isPublished ? 'Yayından Kaldır' : 'Yayınla'}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
          <ConfirmDeleteButton
            label="Sil"
            confirmQuestion={`"${post.title}" silinsin mi?`}
            disabled={pending}
            onConfirm={() =>
              startTransition(async () => {
                setRowState(await deleteNewsAction(post.id));
              })
            }
          />
        </div>
      </div>
      {rowState?.error ? (
        <Alert tone="error" className="mt-2">
          {rowState.error}
        </Alert>
      ) : null}
    </li>
  );
}
