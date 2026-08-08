import Link from 'next/link';
import { BrandMark } from '@/components/brand/brand-mark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-navy-900">
      <header className="container-page py-6">
        <Link href="/" className="inline-flex items-center gap-2 text-white">
          <BrandMark className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight">STEM &amp; BUDS</span>
        </Link>
      </header>

      <main id="main" className="container-page flex flex-1 items-center justify-center pb-16">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="container-page pb-8 text-center text-xs text-navy-300">
        <p>STEM &amp; BUDS — öğrenci liderliğinde mentorluk ve proje programı</p>
      </footer>
    </div>
  );
}
