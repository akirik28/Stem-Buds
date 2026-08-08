import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canSeeComplaintReporter, canViewManagementFeed, isChapterHead, isExecutive } from '@/server/authz/policy';
import { canManageAlertWorkflow, getManagementKpis, listAlertsForViewer, type ManagementAlert } from '@/server/services/alert-query';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { listComplaintsForViewer } from '@/server/services/complaint-service';
import { listContinuousFeedbackForViewer } from '@/server/services/feedback-service';
import { getUserById } from '@/server/services/user-admin';
import { getWeeklySummaryInsight, getChapterGroupStatusInsight } from '@/server/services/management-ai';
import { listPrograms } from '@/server/services/program-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { ALL_PROGRAMS_LABEL } from '@/server/domain/program';
import { formatPercent } from '@/lib/format';
import { alertTabLabels, messages } from '@/lib/i18n/tr';
import { AlertCard } from './alert-card';
import { AiInsightSurface } from './ai-insight-surface';
import { ComplaintCard } from './complaint-card';
import { DataQuestionBox } from './data-question-box';
import { FeedbackCard } from './feedback-card';
import { generateChapterGroupStatusAction, generateWeeklySummaryAction, type AiActionState } from './actions';

export const metadata: Metadata = {
  title: 'Yönetim Akışı',
  robots: { index: false, follow: false },
};

const UNAVAILABLE_MESSAGE = 'AI özeti şu anda oluşturulamadı. Mevcut veriler ve uyarılar kullanılmaya devam edebilir.';

export default async function ManagementFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string; tab?: string }>;
}) {
  const context = await requireAuthContext();
  if (!canViewManagementFeed(context.scope)) redirect('/panel');

  const { program: programFilter, tab: tabParam } = await searchParams;
  const tab: 'weekly' | 'project' | 'feedback' = tabParam === 'project' || tabParam === 'feedback' ? tabParam : 'weekly';

  // Cheap, throttled: a no-op most of the time, a real (idempotent) sweep
  // at most once every 5 minutes.
  await runAlertEvaluation();

  const [kpis, programs] = await Promise.all([
    getManagementKpis(context.scope, { programId: programFilter }),
    isExecutive(context.scope.role) ? listPrograms() : Promise.resolve([]),
  ]);

  const alerts =
    tab === 'feedback'
      ? []
      : await listAlertsForViewer(context.scope, { programId: programFilter, tab });

  let complaints: Awaited<ReturnType<typeof listComplaintsForViewer>> = [];
  let complaintReporterLabels = new Map<string, string | null>();
  let feedbackItems: Awaited<ReturnType<typeof listContinuousFeedbackForViewer>> = [];
  let feedbackReporterLabels = new Map<string, string | null>();
  if (tab === 'feedback') {
    [complaints, feedbackItems] = await Promise.all([
      listComplaintsForViewer(context.scope, { programId: programFilter }),
      listContinuousFeedbackForViewer(context.scope, { programId: programFilter }),
    ]);

    const complaintReporterIds = [
      ...new Set(
        complaints
          .filter((c) => c.reporterUserId && canSeeComplaintReporter(context.scope, c))
          .map((c) => c.reporterUserId as string),
      ),
    ];
    const feedbackReporterIds = [...new Set(feedbackItems.filter((f) => f.reporterUserId).map((f) => f.reporterUserId as string))];

    const [complaintReporters, feedbackReporters] = await Promise.all([
      Promise.all(complaintReporterIds.map((id) => getUserById(id))),
      Promise.all(feedbackReporterIds.map((id) => getUserById(id))),
    ]);
    complaintReporterLabels = new Map(complaintReporterIds.map((id, i) => [id, complaintReporters[i]?.fullName ?? null]));
    feedbackReporterLabels = new Map(feedbackReporterIds.map((id, i) => [id, feedbackReporters[i]?.fullName ?? null]));
  }

  const singleChapterId = isChapterHead(context.scope.role) ? context.scope.headChapterIds[0] : undefined;

  let weeklySummary: AiActionState | null = null;
  if (isExecutive(context.scope.role)) {
    const result = await getWeeklySummaryInsight(context.scope, programFilter ?? null, { id: context.user.id, name: context.user.fullName });
    weeklySummary = result.status === 'unavailable' ? { status: 'unavailable', message: UNAVAILABLE_MESSAGE } : { status: 'ok', insight: result.insight, cached: result.cached };
  }

  let chapterGroupStatus: AiActionState | null = null;
  if (isChapterHead(context.scope.role) && singleChapterId) {
    const result = await getChapterGroupStatusInsight(context.scope, singleChapterId, { id: context.user.id, name: context.user.fullName });
    chapterGroupStatus = result.status === 'unavailable' ? { status: 'unavailable', message: UNAVAILABLE_MESSAGE } : { status: 'ok', insight: result.insight, cached: result.cached };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Yönetim Akışı</h1>
        <p className="mt-1 text-sm text-navy-500">
          {kpis.openAlertCount > 0
            ? `Şu anda ${kpis.openAlertCount} konu dikkat gerektiriyor.`
            : 'Şu anda dikkat gerektiren bir konu bulunmuyor.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Aktif Chapter" value={String(kpis.activeChapters)} />
        <Kpi label="Aktif Grup" value={String(kpis.activeGroups)} />
        <Kpi label="Katılım" value={formatPercent(kpis.attendanceRate !== null ? kpis.attendanceRate * 100 : null)} />
        <Kpi label="Ödev Tamamlama" value={formatPercent(kpis.homeworkCompletionRate !== null ? kpis.homeworkCompletionRate * 100 : null)} />
        <Kpi label="Haftalık Kayıt" value={formatPercent(kpis.weeklyRecordCompletionRate !== null ? kpis.weeklyRecordCompletionRate * 100 : null)} />
        <Kpi label="Dikkat Gereken Proje" value={String(kpis.projectsNeedingAttention)} />
      </div>

      {isExecutive(context.scope.role) ? (
        <nav aria-label="Program filtresi" className="flex flex-wrap gap-2">
          <ProgramFilterLink label={ALL_PROGRAMS_LABEL} active={!programFilter} href={`/panel/yonetim-akisi?tab=${tab}`} />
          {programs.map((program) => (
            <ProgramFilterLink
              key={program.id}
              label={program.shortName}
              active={programFilter === program.id}
              href={`/panel/yonetim-akisi?tab=${tab}&program=${program.id}`}
            />
          ))}
        </nav>
      ) : null}

      {weeklySummary ? (
        <Card>
          <CardTitle>Haftalık Özet</CardTitle>
          <div className="mt-3">
            <AiInsightSurface
              initial={weeklySummary}
              title="Haftalık Özet"
              onRegenerate={generateWeeklySummaryAction.bind(null, programFilter ?? null, true)}
            />
          </div>
        </Card>
      ) : null}

      {isExecutive(context.scope.role) ? (
        <Card>
          <CardTitle>Verilere Sor</CardTitle>
          <div className="mt-3">
            <DataQuestionBox programId={programFilter ?? null} />
          </div>
        </Card>
      ) : null}

      {chapterGroupStatus && singleChapterId ? (
        <Card>
          <CardTitle>Grup Durumları</CardTitle>
          <div className="mt-3">
            <AiInsightSurface
              initial={chapterGroupStatus}
              title="Grup Durumları"
              onRegenerate={generateChapterGroupStatusAction.bind(null, singleChapterId, true)}
            />
          </div>
        </Card>
      ) : null}

      <nav aria-label="Sekmeler" className="flex flex-wrap gap-2 border-b border-navy-100">
        {(['weekly', 'project', 'feedback'] as const).map((t) => (
          <Link
            key={t}
            href={`/panel/yonetim-akisi?tab=${t}${programFilter ? `&program=${programFilter}` : ''}`}
            className={
              tab === t
                ? 'border-b-2 border-navy-800 px-3 py-2 text-sm font-medium text-navy-900'
                : 'px-3 py-2 text-sm text-navy-500 hover:text-navy-700'
            }
          >
            {alertTabLabels[t]}
          </Link>
        ))}
      </nav>

      {tab === 'feedback' ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">Şikâyetler</h2>
            {complaints.length === 0 ? (
              <EmptyState title={messages.empty.noComplaints} />
            ) : (
              complaints.map((complaint) => (
                <ComplaintCard
                  key={complaint.id}
                  complaint={complaint}
                  reporterLabel={complaint.reporterUserId ? (complaintReporterLabels.get(complaint.reporterUserId) ?? null) : null}
                  canManage={isExecutive(context.scope.role) || (isChapterHead(context.scope.role) && context.scope.headChapterIds.includes(complaint.chapterId))}
                />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">Geri Bildirimler</h2>
            {feedbackItems.length === 0 ? (
              <EmptyState title={messages.empty.noFeedback} />
            ) : (
              feedbackItems.map((item) => (
                <FeedbackCard
                  key={item.id}
                  feedback={item}
                  reporterLabel={item.reporterUserId ? (feedbackReporterLabels.get(item.reporterUserId) ?? null) : null}
                />
              ))
            )}
          </section>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState title="Şu anda dikkat gerektiren bir konu bulunmuyor." />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} linkHref={buildAlertLink(alert)} canManage={canManageAlertWorkflow(context.scope, alert)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-semibold text-navy-900">{value}</p>
      <p className="mt-1 text-xs text-navy-500">{label}</p>
    </Card>
  );
}

function ProgramFilterLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
          : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
      }
    >
      {label}
    </Link>
  );
}

export function buildAlertLink(alert: ManagementAlert): string | null {
  if (!alert.chapterId || !alert.groupId) return null;
  const base = `/panel/gruplar/${alert.chapterId}/${alert.groupId}`;
  if (alert.category === 'missing_weekly_record' || alert.category === 'attendance_risk') {
    const sessionId = (alert.metadata as { sessionId?: string })?.sessionId;
    return sessionId ? `${base}/oturumlar/${sessionId}` : base;
  }
  if (alert.category === 'project_stale' || alert.category === 'project_blocked' || alert.category === 'milestone_overdue') {
    return `${base}/proje`;
  }
  return base;
}
