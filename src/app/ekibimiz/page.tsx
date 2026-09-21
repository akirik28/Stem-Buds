import type { Metadata } from 'next';
import Link from 'next/link';
import { listPublicLeadershipProfiles } from '@/server/services/public-site-service';
import { EmptyState } from '@/components/ui/card';
import { SiteHeader } from '../site-header';

export const metadata: Metadata = {
  title: 'Yönetim Ekibimizle Tanışın',
  description:
    'STEM & BUDS Türkiye’yi yürüten öğrenci liderleri: bölge direktörlüğü, chapter başkanlıkları ve program ekibi.',
  robots: { index: true, follow: true },
};

/** The public site is content-managed, so this is never statically frozen. */
export const dynamic = 'force-dynamic';

export default async function LeadershipPage() {
  const leadership = await listPublicLeadershipProfiles();

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <SiteHeader />

      <main id="main" className="flex-1">
        <section className="container-page py-14 sm:py-20">
          <p className="eyebrow">Yönetim</p>
          <h1 className="mt-3 max-w-3xl font-display text-[32px]/[1.15] font-semibold tracking-[-0.02em] sm:text-[40px]">
            Yönetim ekibimizle tanışın
          </h1>
          <p className="mt-4 max-w-2xl text-[15px]/[1.7] text-ink-2">
            STEM & BUDS öğrenci liderliğinde yürüyen bir programdır. Aşağıdaki ekip; chapter’ların
            kurulmasından mentor eğitimine, haftalık işleyişin takibinden proje yönlendirmesine
            kadar programın her adımını yürütür.
          </p>
        </section>

        <section className="container-page pb-20">
          {leadership.length === 0 ? (
            <EmptyState
              title="Ekip profilleri henüz yayımlanmadı."
              description="Yönetim ekibi bilgileri panelden yayımlandığında bu sayfada görünecek."
            />
          ) : (
            // auto-fit rather than a fixed four columns: the team grows and
            // shrinks over the year, so the row count follows the number of
            // people and the viewport instead of the cards stretching or
            // being cut off.
            <ul className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(224px,1fr))]">
              {leadership.map((person) => (
                <li key={person.id} className="aura-card flex flex-col overflow-hidden p-0">
                  <div className="relative aspect-[3/4] w-full bg-surface-2">
                    {person.photoMediaId ? (
                      // Photos are served through the app so unpublished media
                      // can never be reached by guessing a storage URL.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/public-media/${person.photoMediaId}`}
                        alt={person.fullName}
                        className="absolute inset-0 size-full object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 grid place-items-center [background-image:var(--stripe)]"
                      >
                        <span className="rounded-full bg-surface px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-3">
                          Görsel alanı
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-1.5 p-5">
                    <h2 className="font-display text-[18px]/[1.25] font-semibold tracking-[-0.02em] text-ink">
                      {person.fullName}
                    </h2>
                    <p className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ok">
                      {person.title}
                    </p>
                    {person.bio ? (
                      <p className="mt-1 text-[13.5px]/[1.7] text-ink-2">{person.bio}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="bg-surface py-16">
          <div className="container-page flex flex-col items-start gap-4">
            <h2 className="font-display text-[26px]/[1.2] font-semibold tracking-[-0.02em]">
              Ekibe katılmak ister misiniz?
            </h2>
            <p className="max-w-2xl text-[14.5px]/[1.7] text-ink-2">
              Mentor olmak, okulunuzda bir chapter açmak veya programa öğrenci olarak katılmak için
              bizimle iletişime geçin.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/#iletisim"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-control)] bg-ok px-5 text-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                Bize ulaşın
              </Link>
              <a
                href="mailto:info@stemandbuds.com"
                className="text-sm font-semibold text-ok hover:underline"
              >
                info@stemandbuds.com
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
