'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { formatShortDateTr } from '@/lib/format';
import { activateAcademicYearAction } from './actions';

export function AcademicYearRow({
  year,
}: {
  year: { id: string; label: string; startDate: string; endDate: string; isActive: boolean };
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-navy-900">{year.label}</p>
        <p className="text-sm text-navy-500">
          {formatShortDateTr(year.startDate)} – {formatShortDateTr(year.endDate)}
        </p>
      </div>
      {year.isActive ? (
        <StatusPill tone="ok" icon="✅">
          Aktif
        </StatusPill>
      ) : (
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
      )}
    </div>
  );
}
