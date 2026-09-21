import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand text-bg hover:bg-brand disabled:bg-surface-3',
  secondary:
    'bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2 disabled:text-ink-3',
  ghost: 'bg-transparent text-ink-2 hover:bg-surface-2 disabled:text-ink-3',
  danger: 'bg-danger text-bg hover:bg-danger disabled:bg-danger-soft',
};

const sizeClasses: Record<Size, string> = {
  // Touch targets stay at least 44px tall from `md` upwards.
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
