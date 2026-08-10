'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDeleteButton } from '@/components/ui/confirm-delete-button';
import { StatusPill } from '@/components/ui/status';
import { formatShortDateTr } from '@/lib/format';
import { activateAcademicYearAction, deleteAcademicYearAction, type ActionState } from './actions';

export function AcademicYearRow({
  year,
}: {
  year: { id: string; label: string; startDate: string; endDate: string; isActive: boolean };
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);

  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-navy-900">{year.label}</p>
          <p className="text-sm text-navy-500">
            {formatShortDateTr(year.startDate)} – {formatShortDateTr(year.endDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {year.isActive ? (
            <StatusPill tone="ok" icon="✅">
              Aktif
            </StatusPill>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await activateAcademicYearAction(year.id);
                  })
                }
              >
                Aktifleştir
              </Button>
              <ConfirmDeleteButton
                label="Sil"
                confirmQuestion={`"${year.label}" ve ona ait tüm gruplar, üyelikler kalıcı silinsin mi? Bu işlem geri alınamaz.`}
                disabled={pending}
                onConfirm={() =>
                  startTransition(async () => {
                    setResult(await deleteAcademicYearAction(year.id));
                  })
                }
              />
            </>
          )}
        </div>
      </div>
      {result?.error ? (
        <Alert tone="error" className="mt-2">
          {result.error}
        </Alert>
      ) : null}
    </div>
  );
}
