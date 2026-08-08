import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The official STEM & BUDS Türkiye mark.
 *
 * PLACEHOLDER STATE: the real logo file has not been provided as a filesystem
 * asset yet (only seen inline in chat, and once as a crop from an Instagram
 * slide export — neither is treated as the source of truth here per explicit
 * instruction not to redraw, approximate, or substitute a cropped version).
 *
 * This renders a plain, honest monogram — no invented leaf/circuit artwork —
 * until the real file exists at `public/brand/stem-buds-logo.png`. The moment
 * that file is added, flip `LOGO_ASSET_READY` to `true` below; every caller
 * of `BrandMark`/`BrandLockup` picks up the real asset automatically, with no
 * other change needed anywhere in the app.
 */
const LOGO_ASSET_READY = false;
const LOGO_ASSET_PATH = '/brand/stem-buds-logo.png';
/** Update this once the real file's pixel dimensions are known. */
const LOGO_ASSET_ASPECT_RATIO = 1;

function PlaceholderMark({
  className,
  heightPx,
}: {
  className?: string;
  heightPx: number;
}) {
  return (
    <span
      role="img"
      aria-label="STEM & BUDS Türkiye logosu (yer tutucu)"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-navy-800 font-semibold text-white',
        className,
      )}
      style={{ height: heightPx, width: heightPx, fontSize: heightPx * 0.4 }}
    >
      <span aria-hidden="true" className="tracking-tight" style={{ fontSize: '1em' }}>
        S&amp;B
      </span>
    </span>
  );
}

export function BrandMark({
  className,
  heightPx = 40,
}: {
  className?: string;
  heightPx?: number;
}) {
  if (!LOGO_ASSET_READY) {
    return <PlaceholderMark className={className} heightPx={heightPx} />;
  }

  const width = Math.round(heightPx * LOGO_ASSET_ASPECT_RATIO);
  return (
    <Image
      src={LOGO_ASSET_PATH}
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
 * The full logo lockup: the mark plus a live STEM & BUDS / TÜRKİYE wordmark.
 *
 * The wordmark is always real, theme-aware text (never baked into the image),
 * so it stays legible on both light and dark surfaces regardless of what the
 * final logo asset looks like.
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
