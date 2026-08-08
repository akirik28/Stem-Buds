'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { formatMinuteOfDay } from '@/lib/format';
import { weekdayLabels } from '@/lib/i18n/tr';
import { updateProgramScheduleAction, type ActionState } from './actions';

type ProgramSettings = {
  weeklyDayOfWeek: number | null;
  weeklyStartMinute: number | null;
  weeklyDurationMinutes: number | null;
  cycleLengthWeeks: number | null;
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? 'Kaydediliyor…' : 'Kaydet'}
    </Button>
  );
}

export function ProgramScheduleForm({
  programId,
  settings,
}: {
  programId: string;
  settings: ProgramSettings;
}) {
  const action = updateProgramScheduleAction.bind(null, programId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-4">
      {state.error ? <Alert tone="error" className="sm:col-span-4">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success" className="sm:col-span-4">{state.success}</Alert> : null}

      <Field label="Gün" htmlFor={`day-${programId}`}>
        <Select
          id={`day-${programId}`}
          name="weeklyDayOfWeek"
          defaultValue={settings.weeklyDayOfWeek ?? ''}
        >
          <option value="">Belirlenmedi</option>
          {weekdayLabels.map((label, index) => (
            <option key={label} value={index + 1}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Başlangıç saati" htmlFor={`start-${programId}`} hint="ÖR. 18:30">
        <Input
          id={`start-${programId}`}
          name="weeklyStartMinute"
          type="text"
          placeholder="18:30"
          defaultValue={
            settings.weeklyStartMinute !== null ? formatMinuteOfDay(settings.weeklyStartMinute) : ''
          }
        />
      </Field>

      <Field label="Süre (dakika)" htmlFor={`duration-${programId}`}>
        <Input
          id={`duration-${programId}`}
          name="weeklyDurationMinutes"
          type="number"
          min={1}
          defaultValue={settings.weeklyDurationMinutes ?? ''}
        />
      </Field>

      <Field label="Döngü uzunluğu (hafta)" htmlFor={`cycle-${programId}`}>
        <Input
          id={`cycle-${programId}`}
          name="cycleLengthWeeks"
          type="number"
          min={1}
          defaultValue={settings.cycleLengthWeeks ?? ''}
        />
      </Field>

      <div className="sm:col-span-4">
        <SubmitButton />
      </div>
    </form>
  );
}
