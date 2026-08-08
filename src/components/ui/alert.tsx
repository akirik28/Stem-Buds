import * as React from 'react';
import { cn } from '@/lib/utils';

export type AlertTone = 'error' | 'success' | 'info' | 'warning';

const toneClasses: Record<AlertTone, string> = {
  error: 'bg-red-50 text-red-900 ring-red-200',
  success: 'bg-leaf-50 text-leaf-900 ring-leaf-200',
  info: 'bg-navy-50 text-navy-900 ring-navy-200',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
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
