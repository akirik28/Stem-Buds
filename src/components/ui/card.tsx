import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[--radius-card] bg-white p-4 ring-1 ring-navy-100 sm:p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...props} />;
}

export function CardTitle({
  className,
  as: Component = 'h2',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h1' | 'h2' | 'h3' | 'h4' }) {
  return <Component className={cn('text-base font-semibold text-navy-900', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-navy-500', className)} {...props} />;
}

export type EmptyStateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
};

/** Consistent Turkish empty state used across the platform. */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[--radius-card] border border-dashed border-navy-200 px-4 py-10 text-center">
      {icon ? <div className="text-navy-300">{icon}</div> : null}
      <p className="text-sm font-medium text-navy-800">{title}</p>
      {description ? <p className="max-w-prose text-sm text-navy-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
