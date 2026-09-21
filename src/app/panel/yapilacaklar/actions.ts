'use server';

import { requireAuthContext } from '@/server/auth/context';
import { isChapterHead, isMentor } from '@/server/authz/policy';
import {
  getChapterGroupStatusInsight,
  getMentorAlertExplainerInsight,
} from '@/server/services/management-ai';
import { toUserMessage } from '@/server/errors';
import type { AiActionState } from '../yonetim-akisi/actions';

const UNAVAILABLE_MESSAGE =
  'AI açıklaması şu anda oluşturulamadı. Aşağıdaki liste her durumda çalışmaya devam eder.';

/**
 * Re-runs the explanation above the to-do list for whichever surface the
 * caller's role owns. Authorization is each insight function's own — this
 * only routes, and falls through to "unavailable" for a role that has no
 * explainer rather than inventing one.
 */
export async function regenerateTaskGuidanceAction(): Promise<AiActionState> {
  const context = await requireAuthContext();
  const actor = { id: context.user.id, name: context.user.fullName };

  try {
    if (isMentor(context.scope.role)) {
      const result = await getMentorAlertExplainerInsight(context.scope, actor, {
        forceRegenerate: true,
      });
      if (result.status === 'no_alerts' || result.status === 'unavailable') {
        return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
      }
      return { status: 'ok', insight: result.insight, cached: result.cached };
    }

    const chapterId = isChapterHead(context.scope.role) ? context.scope.headChapterIds[0] : undefined;
    if (chapterId) {
      const result = await getChapterGroupStatusInsight(context.scope, chapterId, actor, {
        forceRegenerate: true,
      });
      if (result.status === 'unavailable') {
        return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
      }
      return { status: 'ok', insight: result.insight, cached: result.cached };
    }

    return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
}
