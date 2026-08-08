import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isMentor } from '@/server/authz/policy';
import { canManageAlertWorkflow, listAlertsForMentor } from '@/server/services/alert-query';
import { getMentorAlertExplainerInsight } from '@/server/services/management-ai';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { AlertCard } from '../yonetim-akisi/alert-card';
import { buildAlertLink } from '../yonetim-akisi/page';
import { AiInsightSurface } from '../yonetim-akisi/ai-insight-surface';
import type { AiActionState } from '../yonetim-akisi/actions';
import { generateMentorAlertExplainerAction } from './actions';

export const metadata: Metadata = {
  title: 'Dikkat Gerektirenler',
  robots: { index: false, follow: false },
};

const UNAVAILABLE_MESSAGE = 'AI özeti şu anda oluşturulamadı. Mevcut veriler ve uyarılar kullanılmaya devam edebilir.';

/**
 * The Mentor's own compact alert surface — never the Executive/Chapter Head
 * "Yönetim Akışı" feed (see `listAlertsForMentor`'s doc comment). AI here is
 * a single, page-level explanation over the Mentor's own already-generated
 * deterministic alerts — never a free-form question box, never a per-alert
 * button, and never called when there is nothing to explain (Section 6.4).
 */
export default async function MentorAttentionPage() {
  const context = await requireAuthContext();
  if (!isMentor(context.scope.role)) redirect('/panel');

  const alerts = await listAlertsForMentor(context.scope);

  let explainer: AiActionState | null = null;
  if (alerts.length > 0) {
    const result = await getMentorAlertExplainerInsight(context.scope, { id: context.user.id, name: context.user.fullName });
    explainer =
      result.status === 'no_alerts' || result.status === 'unavailable'
        ? { status: 'unavailable', message: UNAVAILABLE_MESSAGE }
        : { status: 'ok', insight: result.insight, cached: result.cached };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Dikkat Gerektirenler</h1>
        <p className="mt-1 text-sm text-navy-500">
          {alerts.length > 0
            ? `Gruplarınızda ${alerts.length} konu dikkat gerektiriyor.`
            : 'Şu anda gruplarınızda dikkat gerektiren bir konu bulunmuyor.'}
        </p>
      </div>

      {explainer ? (
        <Card>
          <CardTitle>Uyarı Açıklaması</CardTitle>
          <div className="mt-3">
            <AiInsightSurface initial={explainer} title="Uyarı Açıklaması" onRegenerate={generateMentorAlertExplainerAction.bind(null, true)} />
          </div>
        </Card>
      ) : null}

      {alerts.length === 0 ? (
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
