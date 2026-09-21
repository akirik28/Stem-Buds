'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Last-resort error boundary. The underlying exception is logged on the server;
 * the user only ever sees a safe Turkish message.
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Beklenmeyen arayüz hatası', { digest: error.digest });
  }, [error.digest]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-ink">Bir şeyler ters gitti</h1>
        <p className="mt-2 text-sm text-ink-2">
          İşlem tamamlanamadı. Lütfen tekrar deneyin; sorun sürerse yönetim ile iletişime geçin.
        </p>
        <Button className="mt-6" onClick={reset}>
          Tekrar dene
        </Button>
      </div>
    </div>
  );
}
