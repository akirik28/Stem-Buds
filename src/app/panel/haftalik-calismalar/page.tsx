import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isMentor, isStudent } from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { getGroupById } from '@/server/services/group-service';
import { listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { pickCurrentSession } from '@/server/domain/session-picker';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { formatShortDateTr, formatTimeRangeTr } from '@/lib/format';
import { weeklySessionStateLabels } from '@/lib/i18n/tr';

export const metadata: Metadata = {
  title: 'Haftalık Çalışmalar',
  robots: { index: false, follow: false },
};

export default async function HaftalikCalismalarPage() {
  const context = await requireAuthContext();
  const { scope } = context;

  if (!isMentor(scope.role) && !isStudent(scope.role)) {
    redirect('/panel');
  }

  const groupIds = isMentor(scope.role) ? scope.mentorGroupIds : scope.studentGroupIds;
  const now = new Date();

  const groupCards = (
    await Promise.all(
      groupIds.map(async (groupId) => {
        const group = await getGroupById(groupId);
        if (!group) return null;
        const chapter = await getChapterById(group.chapterId);
        if (!chapter) return null;
        const sessions = await listWeeklySessionsByGroup(group.id);
        const current = pickCurrentSession(sessions, now);
        return { group, chapter, current };
      }),
    )
  ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Haftalık Çalışmalar</h1>
        <p className="mt-1 text-sm text-navy-500">
          {isMentor(scope.role)
            ? 'Mentor olduğunuz gruplar ve güncel haftalık oturumları.'
            : 'Grubunuz ve güncel haftalık oturumu.'}
        </p>
      </div>

      {groupCards.length === 0 ? (
        <EmptyState
          title={isMentor(scope.role) ? 'Henüz bir gruba mentor olarak atanmadınız.' : 'Henüz bir gruba dahil değilsiniz.'}
        />
      ) : (
        groupCards.map(({ group, chapter, current }) => (
          <Card key={group.id}>
            <div className="flex items-center justify-between">
              <CardTitle>{group.name}</CardTitle>
              <Link
                href={`/panel/gruplar/${chapter.id}/${group.id}`}
                className="text-sm text-navy-500 hover:text-navy-700"
              >
                Grubu görüntüle →
              </Link>
            </div>
            <p className="mt-1 text-sm text-navy-500">{chapter.name}</p>

            {current ? (
              <Link
                href={`/panel/gruplar/${chapter.id}/${group.id}/oturumlar/${current.id}`}
                className="mt-3 flex items-center justify-between rounded-lg border border-navy-100 px-3 py-2.5 text-sm hover:border-navy-200 hover:bg-navy-50"
              >
                <span className="text-navy-700">
                  {current.weekNumber}. Hafta — {formatShortDateTr(current.scheduledStartAt)} ·{' '}
                  {formatTimeRangeTr(current.scheduledStartAt, current.scheduledEndAt)}
                </span>
                <StatusPill tone={current.state === 'scheduled' ? 'info' : 'neutral'}>
                  {weeklySessionStateLabels[current.state]}
                </StatusPill>
              </Link>
            ) : (
              <p className="mt-3 text-sm text-navy-500">Henüz oturum oluşturulmadı.</p>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
