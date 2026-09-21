import * as React from 'react';
import { cn } from '@/lib/utils';
import type { StatusTone } from './status';

/**
 * The card is the product's one surface primitive. It carries the aura —
 * the slow hue cycle leaking out of its border — which is what makes the
 * interface feel lit rather than flat. See `.aura-card` in `globals.css`.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('aura-card p-[18px] sm:p-5', className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-3.5 flex items-start justify-between gap-3', className)} {...props} />
  );
}

export function CardTitle({
  className,
  as: Component = 'h2',
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: 'h1' | 'h2' | 'h3' | 'h4' }) {
  return <Component className={cn('text-[16px] font-semibold text-ink', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-[13.5px]/[1.65] text-ink-3', className)} {...props} />;
}

/** Section eyebrow above a group of cards or rows. */
export function SectionLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('eyebrow', className)} {...props} />;
}

const tintClasses: Record<StatusTone, string> = {
  ok: 'bg-ok-soft/60 border-ok-line text-ok',
  warn: 'bg-warn-soft/60 border-warn-line text-warn',
  danger: 'bg-danger-soft/60 border-danger-line text-danger',
  info: 'bg-info-soft/60 border-info-line text-info',
  ai: 'bg-ai-soft/60 border-ai-line text-ai',
  neutral: 'bg-surface-2 border-line text-ink-2',
};

export type MetricTileProps = {
  /** The number or short value — rendered in the display face. */
  value: React.ReactNode;
  label: string;
  tone?: StatusTone;
  /** Optional one-line context under the label. */
  hint?: string;
  className?: string;
};

/**
 * One figure in the dashboard grid. Each tile carries its own semantic tone
 * so a row of them reads as a status board rather than an undifferentiated
 * wall of numbers.
 */
export function MetricTile({ value, label, tone = 'neutral', hint, className }: MetricTileProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1 rounded-[15px] border px-4 py-[18px]',
        tintClasses[tone],
        className,
      )}
    >
      <span className="font-display text-[28px]/[1.1] font-semibold tracking-[-0.02em]">
        {value}
      </span>
      <span className="text-[12px] font-medium text-ink-2">{label}</span>
      {hint ? <span className="text-[11px] text-ink-3">{hint}</span> : null}
    </div>
  );
}

/** Responsive metric grid — the handoff's `minmax(178px, 1fr)` auto-fit. */
export function MetricGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(178px,1fr))]', className)}
      {...props}
    />
  );
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
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center">
      {icon ? <div className="text-ink-3">{icon}</div> : null}
      <p className="text-[13.5px] font-semibold text-ink">{title}</p>
      {description ? (
        <p className="max-w-prose text-[13px]/[1.65] text-ink-3">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
