import { requireAuthContext } from '@/server/auth/context';
import { listLiveChapters } from '@/server/services/class-mode-service';
import { getClassWatchInsight } from '@/server/services/management-ai';

/**
 * The assistant's read of the hour, rendered on its own.
 *
 * Kept out of the page so the chapter list paints immediately: a model call
 * can take tens of seconds, and somebody walking between rooms should not
 * be staring at a blank screen while it thinks. If it fails or the provider
 * is not configured, this renders nothing at all — the facts above it are
 * the part that has to be there.
 */
export async function ClassWatch({ weekNumber }: { weekNumber: number }) {
  const { scope, user } = await requireAuthContext();

  const live = await listLiveChapters(scope);
  if (live.length === 0) return null;

  const outcome = await getClassWatchInsight(
    scope,
    {
      weekNumber,
      chapters: live.map((chapter) => ({
        chapter: `${chapter.chapterCode} ${chapter.chapterName}`,
        head: chapter.headName,
        headAbsent: chapter.headAbsent,
        roomsSplit: chapter.roomsSplit,
        groups: chapter.groups.length,
        mentorsAway: chapter.groups.filter((group) => group.mentorAbsent).length,
        attendanceMissing: chapter.groups.filter((group) => !group.attendanceDone).length,
        hasLink: chapter.meetingUrl !== null,
      })),
    },
    { id: user.id, name: user.fullName },
  ).catch(() => null);

  if (!outcome || outcome.status !== 'ok') return null;
  const insight = outcome.insight;

  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-3">Şu an dikkat</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink">{insight.summary}</p>
      {insight.attentionItems.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {insight.attentionItems.map((item) => (
            <li key={item.title} className="text-sm text-ink-2">
              <span className="font-semibold text-ink">{item.title}</span> — {item.evidence}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ClassWatchSkeleton() {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface-2 p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-ink-3">Şu an dikkat</h2>
      <p className="mt-2 text-sm text-ink-3">Değerlendiriliyor…</p>
    </section>
  );
}
