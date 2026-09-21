import Link from 'next/link';

/**
 * The public site's footer, shared by every visitor-facing page.
 *
 * It carries the programme's contact address, so a visitor who scrolls past
 * the contact form still has a way to reach us from any page.
 */
export function SiteFooter() {
  return (
    <footer className="bg-bg py-8 text-sm text-ink-3">
      <div className="container-page flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} STEM &amp; BUDS Türkiye</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/ekibimiz" className="transition-colors hover:text-ink-2">
            Ekibimiz
          </Link>
          <a
            href="mailto:info@stemandbuds.com"
            className="font-medium text-ok transition-opacity hover:opacity-80"
          >
            info@stemandbuds.com
          </a>
        </div>
      </div>
    </footer>
  );
}
