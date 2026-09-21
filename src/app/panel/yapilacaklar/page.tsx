import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isChapterHead, isMentor, isParent } from '@/server/authz/policy';
import {
  getChapterGroupStatusInsight,
  getMentorAlertExplainerInsight,
} from '@/server/services/management-ai';
import { listTasksForViewer } from '@/server/services/task-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { TaskList } from '@/components/ui/task-list';
import { AiInsightSurface } from '../yonetim-akisi/ai-insight-surface';
import type { AiActionState } from '../yonetim-akisi/actions';
import { regenerateTaskGuidanceAction } from './actions';

const UNAVAILABLE_MESSAGE =
  'AI açıklaması şu anda oluşturulamadı. Aşağıdaki liste her durumda çalışmaya devam eder.';

export const metadata: Metadata = {
  title: 'Yapılacaklar',
  robots: { index: false, follow: false },
};

/**
 * The whole to-do list, in one column, worked from the top.
 *
 * Deliberately has nothing else on it — no filters, no tabs, no summary
 * tiles. Panelim already carries the numbers; this page exists so that the
 * answer to "what should I do now?" is the first line, and the answer to
 * "and then?" is the second.
 *
 * A Veli has nothing to action here, so they are sent back rather than shown
 * an empty page that implies they should.
 */
export default async function TasksPage() {
  const context = await requireAuthContext();
  const { scope } = context;
  if (isParent(scope.role)) redirect('/panel');

  const tasks = await listTasksForViewer(scope);

  // The list says what to do; this says why, and in what order to think
  // about it. Only for the two roles that actually work the list day to day
  // — and never called over an empty list, per the "no commentary over
  // nothing" rule the AI surfaces already follow.
  const actor = { id: context.user.id, name: context.user.fullName };
  let guidance: AiActionState | null = null;
  if (tasks.length > 0 && isMentor(scope.role)) {
    const result = await getMentorAlertExplainerInsight(scope, actor);
    guidance =
      result.status === 'no_alerts' || result.status === 'unavailable'
        ? { status: 'unavailable', message: UNAVAILABLE_MESSAGE }
        : { status: 'ok', insight: result.insight, cached: result.cached };
  } else if (tasks.length > 0 && isChapterHead(scope.role) && scope.headChapterIds[0]) {
    const result = await getChapterGroupStatusInsight(scope, scope.headChapterIds[0], actor);
    guidance =
      result.status === 'unavailable'
        ? { status: 'unavailable', message: UNAVAILABLE_MESSAGE }
        : { status: 'ok', insight: result.insight, cached: result.cached };
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-display text-[26px]/[1.2] font-semibold tracking-[-0.02em] text-ink">
          Yapılacaklar
        </h1>
        <p className="mt-1 text-[13.5px] text-ink-3">
          {tasks.length > 0
            ? `${tasks.length} madde — en acil olan en üstte.`
            : 'Şu anda yapılacak bir şey yok.'}
        </p>
      </div>

      {guidance ? (
        <Card>
          <CardTitle>Nereden başlamalı</CardTitle>
          <div className="mt-3">
            <AiInsightSurface
              initial={guidance}
              title="Nereden başlamalı"
              onRegenerate={regenerateTaskGuidanceAction}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        {tasks.length === 0 ? (
          <EmptyState
            title="Her şey yolunda."
            description="Yeni bir konu çıktığında burada listelenecek."
          />
        ) : (
          <TaskList tasks={tasks} />
        )}
      </Card>
    </div>
  );
}
