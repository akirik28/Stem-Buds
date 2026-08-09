'use client';

import { useState, useTransition } from 'react';
import Image from 'next/image';
import { Alert } from '@/components/ui/alert';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { deleteMediaAction, type ActionState } from './actions';

export type MediaData = {
  id: string;
  fileName: string;
  altText: string;
  byteSize: number;
};

export function MediaRow({ media }: { media: MediaData }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState | null>(null);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-navy-100 p-3">
      <div className="relative h-32 w-full overflow-hidden rounded-md bg-navy-50">
        <Image src={`/api/public-media/${media.id}`} alt={media.altText} fill className="object-cover" unoptimized />
      </div>
      <p className="truncate text-xs font-medium text-navy-800">{media.fileName}</p>
      <p className="text-xs text-navy-400">{(media.byteSize / 1024).toFixed(0)} KB</p>
      <ConfirmDeleteButton
        label="Sil"
        confirmQuestion={`"${media.fileName}" silinsin mi?`}
        disabled={pending}
        onConfirm={() =>
          startTransition(async () => {
            setState(await deleteMediaAction(media.id));
          })
        }
      />
      {state?.error ? <Alert tone="error">{state.error}</Alert> : null}
    </li>
  );
}
