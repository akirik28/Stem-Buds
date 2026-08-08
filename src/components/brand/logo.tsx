import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The official STEM & BUDS Türkiye mark.
 *
 * Source: the icon was cropped directly from the organization's official
 * lockup (`public/brand/stem-buds-icon.png`) — nothing here is redrawn or
 * approximated. `next/image` keeps the crop's native aspect ratio (319:420)
 * so it is never stretched or distorted; callers set a height and the width
 * follows automatically.
 */
export function BrandMark({
  className,
  heightPx = 40,
}: {
  className?: string;
  /** Rendered height in pixels; width is derived from the asset's aspect ratio. */
  heightPx?: number;
}) {
  const width = Math.round((heightPx * 319) / 420);
  return (
    <Image
      src="/brand/stem-buds-icon.png"
      alt="STEM & BUDS Türkiye logosu"
      width={width}
      height={heightPx}
      className={cn('h-auto w-auto object-contain', className)}
      style={{ height: heightPx, width }}
      priority
    />
  );
}

export type BrandLockupProps = {
  /** `light` renders the wordmark in navy (for light surfaces), `dark` in white. */
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  /** Shows the "TÜRKİYE" line under the wordmark. */
  showRegion?: boolean;
  className?: string;
};

const markHeights = { sm: 32, md: 40, lg: 56 } as const;
const wordSizes = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' } as const;
const regionSizes = { sm: 'text-[0.55rem]', md: 'text-[0.6rem]', lg: 'text-xs' } as const;

/**
 * The full logo lockup: the official icon plus a live STEM & BUDS / TÜRKİYE
 * wordmark.
 *
 * The organization's own lockup asset (`stem-buds-lockup.png`) bakes its
 * wordmark in navy, which disappears on dark surfaces — so navigation and the
 * dark auth header pair the untouched official icon with real, theme-aware
 * text instead of that flattened image, exactly the way this component was
 * already structured. Where a fully static, always-light lockup is wanted
 * (e.g. a footer badge or a printed document), use `stem-buds-lockup.png`
 * directly.
 */
export function BrandLockup({
  tone = 'light',
  size = 'md',
  showRegion = true,
  className,
}: BrandLockupProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark heightPx={markHeights[size]} />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-semibold tracking-tight',
            wordSizes[size],
            tone === 'dark' ? 'text-white' : 'text-navy-800',
          )}
        >
          STEM &amp; BUDS
        </span>
        {showRegion ? (
          <span
            className={cn(
              'mt-1 font-semibold uppercase tracking-[0.35em]',
              regionSizes[size],
              tone === 'dark' ? 'text-navy-200' : 'text-navy-500',
            )}
          >
            Türkiye
          </span>
        ) : null}
      </span>
    </span>
  );
}
