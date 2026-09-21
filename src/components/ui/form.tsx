import * as React from 'react';
import { cn } from '@/lib/utils';

const controlClasses =
  'block w-full rounded-lg border-0 bg-surface px-3 py-2.5 text-ink ring-1 ring-inset ring-line ' +
  'placeholder:text-ink-3 focus:ring-2 focus:ring-inset focus:ring-brand disabled:bg-surface-2 ' +
  'disabled:text-ink-3 aria-[invalid=true]:ring-red-500';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-sm font-medium text-ink', className)} {...props} />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClasses, 'min-h-11', className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlClasses, 'min-h-24', className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClasses, 'min-h-11', className)} {...props} />;
}

export type FieldProps = {
  /** Rendered as the control's `<label>`; always associated via `htmlFor`. */
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
};

/**
 * One labelled form control with its hint and error text wired up for screen
 * readers through `aria-describedby` on the consumer's control.
 */
export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (zorunlu)</span> : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Describedby value for a control that may have a hint and/or an error. */
export function describedBy(id: string, options: { hint?: boolean; error?: boolean }): string | undefined {
  const parts: string[] = [];
  if (options.hint) parts.push(`${id}-hint`);
  if (options.error) parts.push(`${id}-error`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
