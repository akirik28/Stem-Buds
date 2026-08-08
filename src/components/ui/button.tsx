import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-navy-700 text-white hover:bg-navy-600 disabled:bg-navy-300',
  secondary:
    'bg-white text-navy-800 ring-1 ring-inset ring-navy-200 hover:bg-navy-50 disabled:text-navy-300',
  ghost: 'bg-transparent text-navy-700 hover:bg-navy-50 disabled:text-navy-300',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
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
