'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { submitFeedbackCycleResponseAction, type ActionState } from './actions';

const RATING_FIELDS: Array<{ name: string; label: string }> = [
  { name: 'ratingMentorGuidance', label: 'Mentorun yönlendirmesi' },
  { name: 'ratingSessionProductivity', label: 'Çalışmaların verimliliği' },
  { name: 'ratingSupport', label: 'Sorularına yeterli destek alabildin mi?' },
  { name: 'ratingGroupProgress', label: 'Grubun ilerlemesinden memnun musun?' },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Gönderiliyor…' : 'Değerlendirmeyi Gönder'}
    </Button>
  );
}

export function CycleResponseForm({ cycleId }: { cycleId: string }) {
  const action = submitFeedbackCycleResponseAction.bind(null, cycleId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  if (state.success) return <Alert tone="success">{state.success}</Alert>;

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      {RATING_FIELDS.map((field) => (
        <fieldset key={field.name}>
          <legend className="text-sm font-medium text-navy-700">{field.label}</legend>
          <div className="mt-1.5 flex gap-3">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="flex items-center gap-1 text-sm text-navy-600">
                <input type="radio" name={field.name} value={value} required className="accent-leaf-600" />
                {value}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <Field label="En çok neyi faydalı buldun?" htmlFor="mostUseful">
        <Textarea id="mostUseful" name="mostUseful" rows={2} />
      </Field>
      <Field label="Neyin değişmesini isterdin?" htmlFor="wantChanged">
        <Textarea id="wantChanged" name="wantChanged" rows={2} />
      </Field>
      <Field label="Chapter Head'e özel not (opsiyonel)" htmlFor="chapterHeadNote">
        <Textarea id="chapterHeadNote" name="chapterHeadNote" rows={2} />
      </Field>

      <SubmitButton />
    </form>
  );
}
