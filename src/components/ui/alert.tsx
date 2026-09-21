import * as React from 'react';
import { cn } from '@/lib/utils';

export type AlertTone = 'error' | 'success' | 'info' | 'warning';

const toneClasses: Record<AlertTone, string> = {
  error: 'bg-danger-soft text-danger ring-danger-line',
  success: 'bg-ok-soft text-ok ring-ok-line',
  info: 'bg-surface-2 text-ink ring-line',
  warning: 'bg-warn-soft text-warn ring-warn-line',
};

const tonePrefix: Record<AlertTone, string> = {
  error: 'Hata:',
  success: 'Başarılı:',
  info: 'Bilgi:',
  warning: 'Uyarı:',
};

export type AlertProps = {
  tone: AlertTone;
  children: React.ReactNode;
  className?: string;
};

/**
 * Inline message block. Errors and warnings announce themselves politely to
 * assistive technology, and the tone is also spelled out in words.
 */
export function Alert({ tone, children, className }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2.5 text-sm ring-1 ring-inset', toneClasses[tone], className)}
    >
      <span className="sr-only">{tonePrefix[tone]} </span>
      {children}
    </div>
  );
}
