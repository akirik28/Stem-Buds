import * as React from 'react';

/**
 * The STEM & BUDS mark: a sprout whose leaves double as an orbit/node pair —
 * the plant + science + technology language of the programme, drawn as inline
 * SVG so it stays crisp and needs no network request.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="STEM &amp; BUDS logosu"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="20" cy="20" r="19" className="fill-navy-800" />
      <path
        d="M20 30V17"
        className="stroke-leaf-300"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M20 21c-1.6-4.2-5-6-8.6-6 .3 4.2 3.2 7.4 8.6 7.6Z"
        className="fill-leaf-400"
      />
      <path
        d="M20 18.4c1.4-4.6 4.9-6.7 8.7-6.7-.2 4.5-3.2 8-8.7 8.2Z"
        className="fill-leaf-200"
      />
      <circle cx="20" cy="12.6" r="2.5" className="fill-white" />
      <circle cx="20" cy="12.6" r="5.6" className="stroke-navy-400" strokeWidth="1.1" />
    </svg>
  );
}
