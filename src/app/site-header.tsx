import Link from 'next/link';
import { BrandLockup } from '@/components/brand/logo';

/**
 * The public site's header, shared by every visitor-facing page.
 *
 * Section links are absolute (`/#programlar`) rather than bare fragments so
 * they still work from a sub-page — a bare `#programlar` on `/ekibimiz`
 * would look like a dead link.
 */
const NAV = [
  { href: '/ekibimiz', label: 'Ekibimiz' },
  { href: '/#programlar', label: 'Programlar' },
  { href: '/#surec', label: 'Süreç' },
  { href: '/haberler', label: 'Haberler' },
  { href: '/#iletisim', label: 'İletişim' },
];

export function SiteHeader() {
  return (
    <header className="text-ink-on-bg">
      <div className="container-page flex items-center justify-between py-5">
        <Link href="/" className="inline-flex rounded-lg">
          <BrandLockup tone="dark" />
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink sm:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-ink-on-bg-2 transition-colors hover:text-ink-on-bg">
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/giris"
          className="inline-flex min-h-10 items-center justify-center rounded-[var(--radius-control)] bg-ok px-4 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
        >
          Platforma Giriş
        </Link>
      </div>
    </header>
  );
}
