import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * The STEM & BUDS TÜRKİYE mark.
 *
 * Drawn as inline SVG from the official logo so it stays crisp at every size,
 * needs no network request, and can be recoloured for dark surfaces. The
 * composition follows the original: a three-leaf sprout on a circuit-board
 * stem, crossed by a science orbit, with a molecule, a node network and a
 * compass around it.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
  const gradientId = React.useId();
  const leafId = `${gradientId}-leaf`;
  const orbitId = `${gradientId}-orbit`;
  const circuitId = `${gradientId}-circuit`;

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={title ?? 'STEM & BUDS Türkiye logosu'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={leafId} x1="20%" y1="100%" x2="85%" y2="0%">
          <stop offset="0%" stopColor="#1B3F7A" />
          <stop offset="45%" stopColor="#2A7F7C" />
          <stop offset="100%" stopColor="#43B05C" />
        </linearGradient>
        <linearGradient id={orbitId} x1="0%" y1="80%" x2="100%" y2="10%">
          <stop offset="0%" stopColor="#1B3F7A" />
          <stop offset="60%" stopColor="#2A7F7C" />
          <stop offset="100%" stopColor="#43B05C" />
        </linearGradient>
        <linearGradient id={circuitId} x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stopColor="#17356B" />
          <stop offset="100%" stopColor="#2A7F7C" />
        </linearGradient>
      </defs>

      {/* --- Science orbit crossing the plant --- */}
      <ellipse
        cx="60"
        cy="55"
        rx="42"
        ry="18"
        fill="none"
        stroke={`url(#${orbitId})`}
        strokeWidth="2.6"
        transform="rotate(-24 60 55)"
      />

      {/* --- Sprout: left, centre and right leaf --- */}
      <path
        d="M60 74c-3-16-14-24-27-25 1 15 11 25 27 27z"
        fill={`url(#${leafId})`}
        opacity="0.92"
      />
      <path
        d="M60 74C60 52 68 30 60 12c-9 18-1 40 0 62z"
        fill={`url(#${leafId})`}
      />
      <path
        d="M60 70c4-17 16-27 30-28-1 16-13 27-30 30z"
        fill={`url(#${leafId})`}
        opacity="0.85"
      />
      {/* Leaf veins */}
      <path
        d="M60 70c6-9 14-15 23-18M60 72c-5-8-12-13-20-15"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* --- Molecule, top left --- */}
      <path
        d="M25 20l7-4 7 4v8l-7 4-7-4z"
        fill="none"
        stroke={`url(#${orbitId})`}
        strokeWidth="1.8"
      />
      <path
        d="M18 40l8 6M26 46l10-2"
        fill="none"
        stroke={`url(#${orbitId})`}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16" cy="38" r="3.4" fill="#1B3F7A" />
      <circle cx="27" cy="47" r="3.4" fill="#1B3F7A" />

      {/* --- Node network, top right --- */}
      <circle cx="94" cy="16" r="3.4" fill="#2A7F7C" />
      <path
        d="M92 19l-8 8"
        fill="none"
        stroke={`url(#${orbitId})`}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="97" cy="44" r="4" fill="#43B05C" />

      {/* --- Compass / divider, right --- */}
      <path
        d="M92 56v4M88.5 60l-4.5 16M95.5 60l4.5 16"
        fill="none"
        stroke={`url(#${circuitId})`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="92" cy="56" r="2.6" fill="#17356B" />
      <path d="M87 70h10" stroke={`url(#${circuitId})`} strokeWidth="1.6" strokeLinecap="round" />

      {/* --- Hexagon node, centre right --- */}
      <path d="M74 58l5-3 5 3v6l-5 3-5-3z" fill="#2A7F7C" />

      {/* --- Circuit-board stem and roots --- */}
      <path
        d="M60 62v46M60 96h14v-8h8M60 88h-12v-10h-9M60 78h10v-6h9M60 104h-16"
        fill="none"
        stroke={`url(#${circuitId})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="82" cy="88" r="3" fill="#43B05C" />
      <circle cx="39" cy="78" r="3" fill="#1B3F7A" />
      <circle cx="79" cy="72" r="3" fill="#2A7F7C" />
      <circle cx="44" cy="104" r="3" fill="#17356B" />
      <path
        d="M55 108h10"
        stroke={`url(#${circuitId})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export type BrandLockupProps = {
  /** `light` renders the wordmark in navy, `dark` in white for dark surfaces. */
  tone?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  /** Shows the "TÜRKİYE" line under the wordmark. */
  showRegion?: boolean;
  className?: string;
};

const markSizes = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-14 w-14' } as const;
const wordSizes = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' } as const;
const regionSizes = { sm: 'text-[0.55rem]', md: 'text-[0.6rem]', lg: 'text-xs' } as const;

/** The full logo lockup: mark plus the STEM & BUDS / TÜRKİYE wordmark. */
export function BrandLockup({
  tone = 'light',
  size = 'md',
  showRegion = true,
  className,
}: BrandLockupProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark className={markSizes[size]} />
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
