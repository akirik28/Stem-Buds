import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isParent } from '@/server/authz/policy';
import { getChildOverview, listChildren } from '@/server/services/parent-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill, projectHealthTones } from '@/components/ui/status';
import { projectHealthIcons, projectHealthLabels } from '@/lib/i18n/tr';
import { formatDateTimeTr, formatMinuteOfDay } from '@/lib/format';
import { ParentScopeBadge, ParentPrivacyNote } from '../parent-scope-badge';

export const metadata: Metadata = {
  title: 'Çocuğumun grubu',
  robots: { index: false, follow: false },
};

/** ISO weekday (1 = Monday) as used by `programSettings.weeklyDayOfWeek`. */
const WEEKDAYS = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

export default async function ChildGroupPage() {
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
          const overview = await getChildOverview(context.scope, child.studentUserId);

          return (
            <section key={child.studentUserId} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h1 className="font-display text-[30px]/[1.15] font-semibold tracking-[-0.02em] text-ink">
                    {overview.groupName ?? 'Grup atanmadı'}
                  </h1>
                  <p className="mt-1 text-[13.5px] text-ink-3">
                    {overview.studentName}
                    {overview.chapterName ? ` · ${overview.chapterName}` : null}
                  </p>
                </div>
                <ParentScopeBadge childName={overview.studentName} />
              </div>

              {!overview.groupId ? (
                <EmptyState
                  title="Çocuğunuz henüz bir gruba eklenmedi."
                  description="Grup ataması yapıldığında mentor ve çalışma saati bilgileri burada görünecek."
                />
              ) : (
                <>
                  <Card>
                    <CardTitle>Grup bilgileri</CardTitle>
                    <dl className="mt-3.5 flex flex-col gap-2.5">
                      <Row label="Mentor" value={overview.mentorName ?? 'Henüz atanmadı'} />
                      <Row
                        label="Haftalık çalışma"
                        value={
                          overview.weeklySlot
                            ? `${WEEKDAYS[overview.weeklySlot.dayOfWeek] ?? ''} · ${formatMinuteOfDay(
                                overview.weeklySlot.startMinute,
                              )} (${overview.weeklySlot.durationMinutes} dk)`
                            : 'Haftalık çalışma saati henüz belirlenmedi.'
                        }
                      />
                      <Row
                        label="Sıradaki oturum"
                        value={
                          overview.nextSessionAt
                            ? formatDateTimeTr(overview.nextSessionAt)
                            : 'Planlanmış oturum yok'
                        }
                      />
                      <Row label="Grup büyüklüğü" value={`${overview.groupStudentCount} öğrenci`} />
                    </dl>
                    <div className="mt-3.5">
                      <ParentPrivacyNote studentCount={overview.groupStudentCount} />
                    </div>
                  </Card>

                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <CardTitle>Grup projesi</CardTitle>
                      {overview.project ? (
                        <StatusPill
                          tone={projectHealthTones[overview.project.health]}
                          icon={projectHealthIcons[overview.project.health]}
                        >
                          {projectHealthLabels[overview.project.health]}
                        </StatusPill>
                      ) : null}
                    </div>

                    {!overview.project ? (
                      <p className="mt-3 text-[13px] text-ink-3">Henüz proje oluşturulmadı.</p>
                    ) : (
                      <div className="mt-3.5 flex flex-col gap-3">
                        <p className="text-[15px] font-semibold text-ink">
                          {overview.project.name}
                        </p>
                        <div>
                          <div className="flex items-center justify-between text-[12px] text-ink-2">
                            <span>Kilometre taşları</span>
                            <span>
                              {overview.milestones.completed} / {overview.milestones.total}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-ok"
                              style={{
                                width: `${
                                  overview.milestones.total > 0
                                    ? Math.round(
                                        (overview.milestones.completed / overview.milestones.total) *
                                          100,
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                </>
              )}
            </section>
          );
        }),
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line-soft pb-2.5 last:border-0 last:pb-0">
      <dt className="text-[12px] font-medium text-ink-3">{label}</dt>
      <dd className="text-[13.5px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
