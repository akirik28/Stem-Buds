import Link from 'next/link';
import { BrandLockup } from '@/components/brand/logo';

/**
 * Placeholder public entry point. The full public website — hero, programme,
 * chapters, projects, leadership, news and contact — is built in a later phase.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col bg-navy-900 text-white">
      <header className="container-page py-6">
        <Link href="/" className="inline-flex rounded-lg">
          <BrandLockup tone="dark" />
        </Link>
      </header>

      <main id="main" className="container-page flex flex-1 items-center py-16">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Fikri projeye, merakı üretime dönüştürüyoruz.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-navy-100">
            STEM &amp; BUDS, lise öğrencilerini mentorlarla bir araya getirerek fikirleri yıl
            boyunca gerçek araştırma ve proje çalışmalarına dönüştüren öğrenci liderliğinde bir
            programdır.
          </p>
          <div className="mt-8">
            <Link
              href="/giris"
              className="inline-flex min-h-12 items-center justify-center rounded-lg bg-leaf-500 px-6 text-base font-medium text-white transition-colors hover:bg-leaf-600"
            >
              Platforma Giriş
            </Link>
          </div>
        </div>
      </main>

      <footer className="container-page pb-8 text-sm text-navy-300">
        <p>stemandbuds01@gmail.com</p>
      </footer>
    </div>
  );
}
