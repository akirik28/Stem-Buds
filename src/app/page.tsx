import Link from 'next/link';
import { SiteHeader } from './site-header';
import { SiteFooter } from './site-footer';
import { HeroSlideshow } from './hero-slideshow';
import { listPrograms } from '@/server/services/program-service';
import { listPublicHighlights, listPublicLeadershipProfiles, listPublishedNewsPosts } from '@/server/services/public-site-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { disciplineLabels } from '@/lib/i18n/tr';
import { formatDateTr } from '@/lib/format';
import { ContactForm } from './contact-form';

// This page reads PostgreSQL directly. Keep the query at request time so a
// clean production build never depends on an already-migrated database and
// newly published CMS content is visible immediately.
export const dynamic = 'force-dynamic';

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
    <div className="flex min-h-dvh flex-col bg-bg text-ink-on-bg">
      <SiteHeader />

      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        <div aria-hidden="true" className="hero-glow" />

        <div className="container-page relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
          <div>
            <span className="inline-flex items-center rounded-full border border-ink-on-bg/20 bg-bg/40 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-on-bg-2 backdrop-blur">
              Öğrenci liderliğinde · ücretsiz
            </span>

            <h1 className="mt-6 font-display text-[40px]/[1.08] font-semibold tracking-[-0.03em] text-ink-on-bg sm:text-[56px]">
              Fikri projeye,
              <br />
              merakı üretime
              <br />
              dönüştürüyoruz.
            </h1>

            <p className="mt-6 max-w-xl text-[16px]/[1.75] text-ink-on-bg-2">
              STEM &amp; BUDS, ortaokul öğrencilerini lise mentorlarıyla bir araya getirerek meraklarını
              gerçek araştırma ve proje çalışmalarına dönüştüren, öğrenci liderliğinde bir programdır.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#programlar"
                className="group inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-ink-on-bg px-7 text-[15px] font-semibold text-bg transition-opacity hover:opacity-90"
              >
                Programları Keşfet
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </a>
              <a
                href="#iletisim"
                className="inline-flex min-h-13 items-center justify-center rounded-full border border-ink-on-bg/25 bg-bg/40 px-7 text-[15px] font-semibold text-ink-on-bg backdrop-blur transition-colors hover:border-ink-on-bg/50"
              >
                Bize Ulaşın
              </a>
            </div>
          </div>

          <HeroSlideshow />
        </div>
      </section>

      <main id="main" className="flex-1">
        {/* What we do */}
        <section className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Ne Yapıyoruz</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line-soft">
              <h3 className="text-lg font-semibold text-ink">Mentorluk</h3>
              <p className="mt-2 leading-relaxed text-ink-2">
                Lise öğrencisi mentorlar, ortaokul öğrencilerine yalnızca bir konuyu anlatmaz; proje geliştirme
                süreci boyunca onlara rehberlik eder.
              </p>
            </div>
            <div className="rounded-2xl bg-surface p-6 ring-1 ring-line-soft">
              <h3 className="text-lg font-semibold text-ink">Gerçek Çıktı</h3>
              <p className="mt-2 leading-relaxed text-ink-2">
                Amaç yalnızca bir konuyu öğrenmek değildir. Öğrenciler somut bir şey ortaya koyar — alana göre bu
                araştırma, analiz, tasarım, deney, yazılım veya mühendislik çalışması olabilir.
              </p>
            </div>
          </div>
        </section>

        {/* Programs */}
        {onlineProgram || bilsemProgram ? (
          <section id="programlar" className="bg-surface py-16 sm:py-20">
            <div className="container-page">
              <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Programlarımız</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {onlineProgram ? (
                  <div className="rounded-2xl bg-bg p-6 ring-1 ring-line-soft">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ok">Program</p>
                    <h3 className="mt-1 text-xl font-semibold text-ink">{onlineProgram.name}</h3>
                    <p className="mt-3 leading-relaxed text-ink-2">{onlineProgram.description}</p>
                  </div>
                ) : null}
                {bilsemProgram ? (
                  <div className="rounded-2xl bg-bg p-6 ring-1 ring-line-soft">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ok">Program</p>
                    <h3 className="mt-1 text-xl font-semibold text-ink">{bilsemProgram.name}</h3>
                    <p className="mt-3 leading-relaxed text-ink-2">{bilsemProgram.description}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {/* How it works */}
        <section id="surec" className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Süreç Nasıl İşliyor</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="rounded-2xl bg-surface p-6 ring-1 ring-line-soft">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-3 text-sm font-semibold text-ink">
                  {item.step}
                </span>
                <h3 className="mt-4 text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* STEM areas */}
        <section className="bg-surface py-16 sm:py-20">
          <div className="container-page">
            <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Çalışma Alanları</h2>
            <div className="mt-8 flex flex-wrap gap-3">
              {Object.values(disciplineLabels).map((label) => (
                <span
                  key={label}
                  className="inline-flex min-h-10 items-center rounded-full bg-surface-2 px-4 text-sm font-medium text-ink ring-1 ring-inset ring-line-soft"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Why STEM & BUDS */}
        <section className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Neden STEM &amp; BUDS</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {WHY_ITEMS.map((item) => (
              <div key={item.title} className="rounded-2xl bg-surface p-6 ring-1 ring-line-soft">
                <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Highlights — only when an Executive has published one via the CMS */}
        {highlights.length > 0 ? (
          <section className="bg-surface py-16 sm:py-20">
            <div className="container-page">
              <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Öne Çıkanlar</h2>
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {highlights.map((h) => (
                  <div key={h.id} className="rounded-2xl bg-bg p-6 ring-1 ring-line-soft">
                    <h3 className="text-base font-semibold text-ink">{h.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">{h.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Leadership — only when at least one profile is public */}
        {leadership.length > 0 ? (
          <section className="container-page py-16 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink-on-bg sm:text-3xl">
                Yönetim ekibimizle tanışın
              </h2>
              <Link href="/ekibimiz" className="text-sm font-semibold text-ok hover:underline">
                Tüm ekibi gör →
              </Link>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {leadership.map((person) => (
                <div key={person.id} className="rounded-2xl bg-surface p-6 ring-1 ring-line-soft">
                  <h3 className="text-base font-semibold text-ink">{person.fullName}</h3>
                  <p className="text-sm text-ok">{person.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{person.bio}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* News — only when at least one post is published */}
        {news.length > 0 ? (
          <section className="bg-surface py-16 sm:py-20">
            <div className="container-page">
              <div className="flex items-end justify-between">
                <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Haberler</h2>
                <Link href="/haberler" className="text-sm font-medium text-ok hover:underline">
                  Tümünü gör →
                </Link>
              </div>
              <div className="mt-8 grid gap-6 sm:grid-cols-3">
                {news.map((post) => (
                  <Link key={post.id} href={`/haberler/${post.slug}`} className="block rounded-2xl bg-bg p-6 ring-1 ring-line-soft hover:ring-line">
                    {post.publishedAt ? <p className="text-xs text-ink-3">{formatDateTr(post.publishedAt)}</p> : null}
                    <h3 className="mt-2 text-base font-semibold text-ink">{post.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-2">{post.summary}</p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* About */}
        <section className="container-page py-16 sm:py-20">
          <h2 className="text-2xl font-semibold text-ink-on-bg sm:text-3xl">Hakkımızda</h2>
          <p className="mt-4 max-w-3xl leading-relaxed text-ink-2">
            STEM &amp; BUDS, Üsküdar Amerikan Lisesi öğrenci topluluğuyla organik bir bağa sahip, öğrenciler
            tarafından kurulan ve yürütülen bir mentorluk ve proje programıdır.
          </p>
        </section>

        {/* Contact */}
        <section id="iletisim" className="bg-bg py-16 text-ink sm:py-20">
          <div className="container-page grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl">Bize Ulaşın</h2>
              <p className="mt-4 max-w-md leading-relaxed text-ink">
                Okul temsilcisi misiniz, mentor olmak mı istiyorsunuz, yoksa öğrenci misiniz? Aşağıdaki formu
                doldurun, size dönüş yapalım.
              </p>
              <a
                href="mailto:info@stemandbuds.com"
                className="mt-6 inline-block text-sm font-semibold text-ok hover:underline"
              >
                info@stemandbuds.com
              </a>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
