import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

const toneClasses: Record<StatusTone, string> = {
  ok: 'bg-leaf-50 text-leaf-800 ring-leaf-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  danger: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-navy-50 text-navy-800 ring-navy-200',
  neutral: 'bg-sand-100 text-navy-700 ring-navy-100',
};

export type StatusPillProps = {
  tone: StatusTone;
  /** Decorative marker; the label alone must already carry the meaning. */
  icon?: string;
  children: React.ReactNode;
  className?: string;
};

/**
 * A status chip.
 *
 * Colour is never the only signal: every pill also shows its Turkish wording,
 * so the state is understandable in greyscale and to screen readers.
 */
export function StatusPill({ tone, icon, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        toneClasses[tone],
        className,
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

export const projectHealthTones = {
  on_track: 'ok',
  attention: 'warn',
  delayed: 'danger',
} as const satisfies Record<string, StatusTone>;

export const attendanceTones = {
  present: 'ok',
  absent: 'danger',
  excused: 'warn',
} as const satisfies Record<string, StatusTone>;

export const homeworkTones = {
  pending: 'neutral',
  done: 'ok',
  not_done: 'danger',
  excused: 'warn',
} as const satisfies Record<string, StatusTone>;

export const alertSeverityTones = {
  info: 'info',
  yellow: 'warn',
  red: 'danger',
} as const satisfies Record<string, StatusTone>;
