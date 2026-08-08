import Link from 'next/link';
import { BrandLockup } from '@/components/brand/logo';
import { listPrograms } from '@/server/services/program-service';
import { listPublicHighlights, listPublicLeadershipProfiles, listPublishedNewsPosts } from '@/server/services/public-site-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { disciplineLabels } from '@/lib/i18n/tr';
import { formatDateTr } from '@/lib/format';
import { ContactForm } from './contact-form';

// Reads no cookies/headers, so Next.js would otherwise prerender this once
// at build time and bake in whatever Programs/highlights/leadership/news
// existed then — a real staleness problem once the Phase 11 CMS lets an
// Executive publish new content and expect the live site to reflect it.
export const revalidate = 60;

const WHY_ITEMS = [
  {
    title: 'Öğrenci Liderliğinde',
    body: 'Program öğrenciler tarafından yürütülür; gerçek bir öğrenci liderliği ve mentorluk yapısı içerir.',
  },
  {
    title: 'Mentorluk Odaklı',
    body: 'Lise öğrencisi mentorlar yalnızca bilgi aktarmaz; süreç boyunca öğrenciye rehberlik eder.',
  },
  {
    title: 'Proje Temelli',
    body: 'Hedef bir konuyu ezberlemek değil; ortaya somut bir proje çıkarmaktır.',
  },
  {
    title: 'Süreklilik',
    body: 'Tek seferlik bir atölye değil; tekrarlayan çalışma oturumlarıyla ilerleyen bir süreçtir.',
  },
  {
    title: 'Yapılandırılmış İlerleme',
    body: 'Öğrenci liderliğinde olsa da rastgele değildir; düzenli takip ve geri bildirimle ilerler.',
  },
] as const;

const HOW_IT_WORKS = [
  { step: '1', title: 'Merak / Fikir', body: 'Öğrencinin ilgi duyduğu bir konu ya da soru.' },
  { step: '2', title: 'Mentor Destekli Çalışma', body: 'Bir lise öğrencisi mentorla düzenli, tekrarlayan çalışma oturumları.' },
  { step: '3', title: 'Proje Geliştirme', body: 'Fikir, zaman içinde adım adım gerçek bir projeye dönüşür.' },
  { step: '4', title: 'Çıktı', body: 'Sürecin sonunda ortaya çıkan projenin paylaşılması.' },
] as const;

export default async function HomePage() {
  const [programs, highlights, leadership, news] = await Promise.all([
    listPrograms(),
    listPublicHighlights(),
    listPublicLeadershipProfiles(),
    listPublishedNewsPosts(3),
  ]);
  const onlineProgram = programs.find((p) => p.key === PROGRAM_KEYS.onlineMiddleSchool);
  const bilsemProgram = programs.find((p) => p.key === PROGRAM_KEYS.bilsem);

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50 text-navy-900">
      <header className="bg-navy-900 text-white">
        <div className="container-page flex items-center justify-between py-5">
          <Link href="/" className="inline-flex rounded-lg">
            <BrandLockup tone="dark" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-navy-100 sm:flex">
            <a href="#programlar" className="hover:text-white">
              Programlar
            </a>
            <a href="#surec" className="hover:text-white">
              Süreç
            </a>
            <Link href="/haberler" className="hover:text-white">
              Haberler
            </Link>
            <a href="#iletisim" className="hover:text-white">
              İletişim
            </a>
          </nav>
          <Link
            href="/giris"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-leaf-500 px-4 text-sm font-medium text-white transition-colors hover:bg-leaf-600"
          >
            Platforma Giriş
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-navy-900 text-white">
        <div className="container-page flex flex-col gap-10 py-16 sm:py-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Fikri projeye, merakı üretime dönüştürüyoruz.
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-navy-100">
              STEM &amp; BUDS, ortaokul öğrencilerini lise mentorlarıyla bir araya getirerek meraklarını gerçek
              araştırma ve proje çalışmalarına dönüştüren, öğrenci liderliğinde bir programdır.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#programlar"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-leaf-500 px-6 text-base font-medium text-white transition-colors hover:bg-leaf-600"
              >
                Programları Keşfet
              </a>
              <a
                href="#iletisim"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-white/10 px-6 text-base font-medium text-white ring-1 ring-inset ring-white/30 transition-colors hover:bg-white/20"
              >
                Bize Ulaşın
              </a>
            </div>
          </div>
        </div>
      </section>

      <main id="main" className="flex-1">
        {/* What we do */}
        <section className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Ne Yapıyoruz</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
              <h3 className="text-lg font-semibold text-navy-900">Mentorluk</h3>
              <p className="mt-2 leading-relaxed text-navy-600">
                Lise öğrencisi mentorlar, ortaokul öğrencilerine yalnızca bir konuyu anlatmaz; proje geliştirme
                süreci boyunca onlara rehberlik eder.
              </p>
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
              <h3 className="text-lg font-semibold text-navy-900">Gerçek Çıktı</h3>
              <p className="mt-2 leading-relaxed text-navy-600">
                Amaç yalnızca bir konuyu öğrenmek değildir. Öğrenciler somut bir şey ortaya koyar — alana göre bu
                araştırma, analiz, tasarım, deney, yazılım veya mühendislik çalışması olabilir.
              </p>
            </div>
          </div>
        </section>

        {/* Programs */}
        {onlineProgram || bilsemProgram ? (
          <section id="programlar" className="bg-white py-16 sm:py-20">
            <div className="container-page">
              <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Programlarımız</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {onlineProgram ? (
                  <div className="rounded-2xl bg-sand-50 p-6 ring-1 ring-navy-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-leaf-700">Program</p>
                    <h3 className="mt-1 text-xl font-semibold text-navy-900">{onlineProgram.name}</h3>
                    <p className="mt-3 leading-relaxed text-navy-600">{onlineProgram.description}</p>
                  </div>
                ) : null}
                {bilsemProgram ? (
                  <div className="rounded-2xl bg-sand-50 p-6 ring-1 ring-navy-100">
                    <p className="text-xs font-semibold uppercase tracking-wide text-leaf-700">Program</p>
                    <h3 className="mt-1 text-xl font-semibold text-navy-900">{bilsemProgram.name}</h3>
                    <p className="mt-3 leading-relaxed text-navy-600">{bilsemProgram.description}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* How it works */}
        <section id="surec" className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Süreç Nasıl İşliyor</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-white">
                  {item.step}
                </span>
                <h3 className="mt-4 text-base font-semibold text-navy-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* STEM areas */}
        <section className="bg-white py-16 sm:py-20">
          <div className="container-page">
            <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Çalışma Alanları</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              {Object.values(disciplineLabels).map((label) => (
                <span
                  key={label}
                  className="inline-flex min-h-10 items-center rounded-full bg-sand-100 px-4 text-sm font-medium text-navy-800 ring-1 ring-inset ring-navy-100"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Why STEM & BUDS */}
        <section className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Neden STEM &amp; BUDS</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_ITEMS.map((item) => (
              <div key={item.title} className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
                <h3 className="text-base font-semibold text-navy-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-600">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Highlights — only when an Executive has published one via the CMS */}
        {highlights.length > 0 ? (
          <section className="bg-white py-16 sm:py-20">
            <div className="container-page">
              <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Öne Çıkanlar</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {highlights.map((h) => (
                  <div key={h.id} className="rounded-2xl bg-sand-50 p-6 ring-1 ring-navy-100">
                    <h3 className="text-base font-semibold text-navy-900">{h.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy-600">{h.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Leadership — only when at least one profile is public */}
        {leadership.length > 0 ? (
          <section className="container-page py-16 sm:py-20">
            <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Yönetim Ekibimiz</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {leadership.map((person) => (
                <div key={person.id} className="rounded-2xl bg-white p-6 ring-1 ring-navy-100">
                  <h3 className="text-base font-semibold text-navy-900">{person.fullName}</h3>
                  <p className="text-sm text-leaf-700">{person.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-navy-600">{person.bio}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* News — only when at least one post is published */}
        {news.length > 0 ? (
          <section className="bg-white py-16 sm:py-20">
            <div className="container-page">
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Haberler</h2>
                <Link href="/haberler" className="text-sm font-medium text-leaf-700 hover:underline">
                  Tümünü gör →
                </Link>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                {news.map((post) => (
                  <Link key={post.id} href={`/haberler/${post.slug}`} className="block rounded-2xl bg-sand-50 p-6 ring-1 ring-navy-100 hover:ring-navy-300">
                    {post.publishedAt ? <p className="text-xs text-navy-400">{formatDateTr(post.publishedAt)}</p> : null}
                    <h3 className="mt-2 text-base font-semibold text-navy-900">{post.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-navy-600">{post.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* About */}
        <section className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-navy-900 sm:text-3xl">Hakkımızda</h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-navy-600">
            STEM &amp; BUDS, Üsküdar Amerikan Lisesi öğrenci topluluğuyla organik bir bağa sahip, öğrenciler
            tarafından kurulan ve yürütülen bir mentorluk ve proje programıdır.
          </p>
        </section>

        {/* Contact */}
        <section id="iletisim" className="bg-navy-900 py-16 text-white sm:py-20">
          <div className="container-page grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">Bize Ulaşın</h2>
              <p className="mt-4 max-w-md leading-relaxed text-navy-100">
                Okul temsilcisi misiniz, mentor olmak mı istiyorsunuz, yoksa öğrenci misiniz? Aşağıdaki formu
                doldurun, size dönüş yapalım.
              </p>
              <p className="mt-6 text-sm text-navy-300">stemandbuds01@gmail.com</p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <footer className="bg-navy-950 py-8 text-sm text-navy-400">
        <div className="container-page">
          <p>© {new Date().getFullYear()} STEM &amp; BUDS Türkiye</p>
        </div>
      </footer>
    </div>
  );
}
