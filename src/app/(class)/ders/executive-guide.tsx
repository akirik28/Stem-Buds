import { LogoutButton } from '@/app/panel/logout-button';
import type { LiveChapter } from '@/server/services/class-mode-service';

/**
 * The hour as management sees it: every chapter at once, and where to walk.
 *
 * Not a wizard — an executive is not working through steps, they are looking
 * for the room that needs them. So this is one screen, sorted so the chapters
 * with a problem sit at the top, and the assistant's reading of the same
 * facts sits above all of it.
 */
export function ExecutiveGuide({
  weekNumber,
  chapters,
  watch,
}: {
  weekNumber: number;
  chapters: LiveChapter[];
  /** Streamed in by the page; null while it is still thinking. */
  watch: React.ReactNode;
}) {
  const trouble = (chapter: LiveChapter) =>
    (chapter.headAbsent ? 4 : 0) +
    (chapter.meetingUrl ? 0 : 3) +
    (chapter.roomsSplit ? 0 : 2) +
    chapter.groups.filter((group) => group.mentorAbsent).length;

  const ordered = [...chapters].sort((a, b) => trouble(b) - trouble(a));

  return (
    <div className="class-mode theme-light">
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-8">
        <p className="text-[13px] font-semibold uppercase tracking-[0.18em] text-class-accent">
          Ders modu · Yönetim
        </p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold text-ink">{weekNumber}. Hafta · şu anda</h1>
          <LogoutButton />
        </div>

        <div className="mt-6">{watch}</div>

        <div className="mt-6 space-y-3">
          {ordered.map((chapter) => {
            const away = chapter.groups.filter((group) => group.mentorAbsent).length;
            const pending = chapter.groups.filter((group) => !group.attendanceDone).length;

            return (
              <section
                key={chapter.chapterId}
                className="rounded-[var(--radius-card)] border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-lg font-bold text-ink">
                    {chapter.chapterCode} · {chapter.chapterName}
                  </h2>
                  {chapter.meetingUrl ? (
                    <a
                      href={chapter.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-semibold text-class-accent hover:underline"
                    >
                      Odaya gir →
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-danger">Bağlantı girilmemiş</span>
                  )}
                </div>

                <p className="mt-1 text-sm text-ink-2">
                  Sorumlu: {chapter.headName ?? 'atanmamış'}
                  {chapter.headAbsent ? ' — bu hafta katılamıyor' : ''}
                </p>

                <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
                  <li>{chapter.groups.length} grup</li>
                  <li className={chapter.roomsSplit ? '' : 'font-semibold text-danger'}>
                    {chapter.roomsSplit ? 'Odalar açıldı' : 'Odalar açılmadı'}
                  </li>
                  {away > 0 ? <li className="font-semibold text-danger">{away} mentör yok</li> : null}
                  <li className={pending > 0 ? 'text-ink-2' : 'font-semibold text-ok'}>
                    {pending > 0 ? `${pending} grup yoklama girmedi` : 'Yoklamalar tamam'}
                  </li>
                </ul>
              </section>
            );
          })}
        </div>

        {chapters.length === 0 ? (
          <p className="mt-6 text-sm text-ink-2">Bu hafta planlanmış oturum bulunamadı.</p>
        ) : null}
      </div>
    </div>
  );
}
