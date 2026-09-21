import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-ink-3">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Sayfa bulunamadı</h1>
        <p className="mt-2 text-sm text-ink-2">
          Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-medium text-bg hover:bg-brand"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
