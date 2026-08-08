import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand-50 px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-navy-500">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-navy-900">Sayfa bulunamadı</h1>
        <p className="mt-2 text-sm text-navy-600">
          Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-navy-700 px-5 text-sm font-medium text-white hover:bg-navy-600"
        >
          Ana sayfaya dön
        </Link>
      </div>
    </div>
  );
}
