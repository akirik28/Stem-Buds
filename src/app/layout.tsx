import type { Metadata, Viewport } from 'next';
import { Literata, Manrope } from 'next/font/google';
import './globals.css';

/**
 * Manrope carries every piece of interface text; Literata is reserved for
 * page titles, card titles and the large metric numbers. Both are loaded as
 * CSS variables so `globals.css` can map them onto Tailwind's font tokens
 * rather than class names being threaded through every component.
 */
const manrope = Manrope({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-manrope',
  display: 'swap',
});

const literata = Literata({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-literata',
  display: 'swap',
});

/**
 * Canonical and Open Graph URLs resolve against this. Driven by `APP_URL`
 * rather than hard-coded so a preview deployment describes itself honestly
 * instead of claiming to be the production domain.
 */
const siteUrl = process.env.APP_URL ?? 'https://stemandbuds.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'STEM & BUDS Türkiye',
    template: '%s · STEM & BUDS Türkiye',
  },
  description:
    'STEM & BUDS, lise öğrencilerini mentorlarla bir araya getirerek fikirleri gerçek araştırma ve proje çalışmalarına dönüştüren öğrenci liderliğinde bir programdır.',
  applicationName: 'STEM & BUDS Türkiye',
  icons: { icon: '/brand/stem-buds-icon.png' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#26304a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${manrope.variable} ${literata.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-[var(--radius-control)] bg-surface-2 px-4 py-2 text-sm font-medium text-ink"
        >
          Ana içeriğe geç
        </a>
        {children}
      </body>
    </html>
  );
}
