import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isParent } from '@/server/authz/policy';
import { getChildOverview, listChildWeeks, listChildren } from '@/server/services/parent-service';
import { Card, CardTitle, EmptyState, MetricGrid, MetricTile } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import {
  attendanceIcons,
  attendanceLabels,
  homeworkStatusIcons,
  homeworkStatusLabels,
} from '@/lib/i18n/tr';
import { attendanceTones, homeworkTones } from '@/components/ui/status';
import { formatDateTr, formatPercent } from '@/lib/format';
import { ParentScopeBadge } from '../parent-scope-badge';

export const metadata: Metadata = {
  title: 'Gelişim',
  robots: { index: false, follow: false },
};

export default async function ChildProgressPage() {
  const context = await requireAuthContext();
  if (!isParent(context.scope.role)) redirect('/panel');

  const children = await listChildren(context.scope);
  if (children.length === 0) {
    return <EmptyState title="Henüz bağlı bir öğrenci bulunmuyor." />;
  }

  return (
    <div className="flex flex-col gap-5">
      {await Promise.all(
        children.map(async (child) => {
          const [overview, weeks] = await Promise.all([
            getChildOverview(context.scope, child.studentUserId),
            listChildWeeks(context.scope, child.studentUserId),
          ]);

          return (
            <section key={child.studentUserId} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="font-display text-[30px]/[1.15] font-semibold tracking-[-0.02em] text-ink">
                    {overview.studentName}
                  </h1>
                  <p className="mt-1 text-[13.5px] text-ink-3">
                    {overview.groupName ?? 'Grup atanmadı'}
                    {overview.chapterName ? ` · ${overview.chapterName}` : null}
                  </p>
                </div>
                <ParentScopeBadge childName={overview.studentName} />
              </div>

              <MetricGrid>
                <MetricTile
                  value={formatPercent(
                    overview.attendance.rate !== null ? overview.attendance.rate * 100 : null,
                  )}
                  label="Katılım"
                  tone={
                    overview.attendance.rate === null
                      ? 'neutral'
                      : overview.attendance.rate >= 0.8
                        ? 'ok'
                        : overview.attendance.rate >= 0.65
                          ? 'warn'
                          : 'danger'
                  }
                  hint="Mazeretli günler sayılmaz"
                />
                <MetricTile value={overview.attendance.present} label="Katıldığı oturum" tone="ok" />
                <MetricTile
                  value={overview.attendance.excused}
                  label="Mazeretli"
                  tone="info"
                  hint="Devamsızlık sayılmaz"
                />
                <MetricTile
                  value={overview.homework.done}
                  label="Yaptığı ödev"
                  tone={overview.homework.notDone > overview.homework.done ? 'warn' : 'ok'}
                />
              </MetricGrid>

              <Card>
                <CardTitle>Hafta hafta</CardTitle>
                {weeks.length === 0 ? (
                  <p className="mt-3 text-[13px] text-ink-3">Henüz kayıtlı bir oturum yok.</p>
                ) : (
                  <ul className="mt-3.5 flex flex-col gap-2">
                    {weeks.map((week) => (
                      <li
                        key={week.weekNumber}
                        className="flex flex-wrap items-center gap-3 rounded-[var(--radius-row)] border border-line bg-surface-2 px-3.5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-ink">
                            {week.weekNumber}. Hafta
                          </p>
                          <p className="text-[11.5px] text-ink-3">
                            {formatDateTr(week.scheduledStartAt)}
                          </p>
                          {week.attendanceNote ? (
                            <p className="mt-1 text-[11.5px] text-info">{week.attendanceNote}</p>
                          ) : null}
                        </div>

                        {week.attendance ? (
                          <StatusPill
                            tone={attendanceTones[week.attendance]}
                            icon={attendanceIcons[week.attendance]}
                            dashed={week.attendance === 'excused'}
                          >
                            {attendanceLabels[week.attendance]}
                          </StatusPill>
                        ) : (
                          <span className="text-[11.5px] text-ink-3">Kayıt girilmedi</span>
                        )}

                        {week.homework ? (
                          <StatusPill
                            tone={homeworkTones[week.homework]}
                            icon={homeworkStatusIcons[week.homework]}
                            dashed={week.homework === 'excused'}
                          >
                            Ödev: {homeworkStatusLabels[week.homework]}
                          </StatusPill>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          );
        }),
      )}
    </div>
  );
}
