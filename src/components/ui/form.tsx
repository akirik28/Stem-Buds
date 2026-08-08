import * as React from 'react';
import { cn } from '@/lib/utils';

const controlClasses =
  'block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-navy-900 ring-1 ring-inset ring-navy-200 ' +
  'placeholder:text-navy-300 focus:ring-2 focus:ring-inset focus:ring-navy-500 disabled:bg-navy-50 ' +
  'disabled:text-navy-400 aria-[invalid=true]:ring-red-500';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-sm font-medium text-navy-800', className)} {...props} />
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
          <span className="ml-1 text-red-700" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (zorunlu)</span> : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-navy-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm text-red-700">
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
