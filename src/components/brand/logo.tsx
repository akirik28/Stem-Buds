import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The official STEM & BUDS Türkiye mark.
 *
 * Two real, unmodified crops of the organization's own file
 * (`public/brand/stem-buds-logo.png`) back these components — nothing here is
 * redrawn, recolored, or approximated:
 *
 *  - `stem-buds-icon.png` is a plain rectangular crop of the symbol alone
 *    (no drawing, no recoloring), used wherever a compact mark is needed
 *    (nav header, favicon).
 *  - `stem-buds-logo.png` is the full lockup exactly as provided, used at
 *    larger display sizes where its baked-in wordmark stays legible (login
 *    card, public site hero).
 *
 * Both sit on the flat white background the source file ships with (it has
 * no alpha channel) — `BrandMark`'s dark-surface caller wraps it in a white
 * card rather than the image being edited to fake transparency.
 */
const ICON_ASPECT_RATIO = 374 / 495;
const FULL_LOGO_ASPECT_RATIO = 1408 / 768;

export function BrandMark({
  className,
  heightPx = 40,
}: {
  className?: string;
  heightPx?: number;
}) {
  const width = Math.round(heightPx * ICON_ASPECT_RATIO);
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

/**
 * The full official lockup (icon + "STEM & BUDS TÜRKİYE" wordmark baked in),
 * shown at its native aspect ratio. Use where there is room to display it
 * large enough to stay legible — the source composition is a tall poster
 * layout, not a compact header lockup.
 */
export function BrandFullLogo({
  className,
  widthPx = 240,
}: {
  className?: string;
  widthPx?: number;
}) {
  const height = Math.round(widthPx / FULL_LOGO_ASPECT_RATIO);
  return (
    <Image
      src="/brand/stem-buds-logo.png"
      alt="STEM & BUDS Türkiye logosu"
      width={widthPx}
      height={height}
      className={cn('h-auto w-auto object-contain', className)}
      style={{ width: widthPx, height }}
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
 * Compact lockup for navigation/header use: the official icon crop plus a
 * live, theme-aware "STEM & BUDS" / "TÜRKİYE" wordmark (real text, not part
 * of the image) — the source lockup's own baked-in text is navy-on-white and
 * would disappear on a dark header, so this recomposes icon + real text
 * instead of shrinking the whole poster-style asset into an illegible chip.
 * For a light surface, wrap in `BrandMarkOnDark`'s sibling usage is not
 * needed since the icon's own white background already reads fine there;
 * on a dark surface, `BrandMarkOnDark` below gives the icon its needed white
 * plate.
 */
export function BrandLockup({
  tone = 'light',
  size = 'md',
  showRegion = true,
  className,
}: BrandLockupProps) {
  const mark =
    tone === 'dark' ? (
      <BrandMarkOnDark heightPx={markHeights[size]} />
    ) : (
      <BrandMark heightPx={markHeights[size]} />
    );

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {mark}
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

/**
 * The icon on a small white plate, for placement directly on a dark surface
 * (the source file has an opaque white background, not transparency).
 */
function BrandMarkOnDark({ heightPx }: { heightPx: number }) {
  const pad = Math.round(heightPx * 0.18);
  return (
    <span
      className="inline-flex items-center justify-center rounded-lg bg-white shadow-sm"
      style={{ padding: pad }}
    >
      <BrandMark heightPx={heightPx} />
    </span>
  );
}
