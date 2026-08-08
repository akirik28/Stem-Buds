'use server';

import { requireAuthContext } from '@/server/auth/context';
import { getMentorAlertExplainerInsight } from '@/server/services/management-ai';
import { toUserMessage } from '@/server/errors';
import type { AiActionState } from '../yonetim-akisi/actions';

const UNAVAILABLE_MESSAGE = 'AI özeti şu anda oluşturulamadı. Mevcut veriler ve uyarılar kullanılmaya devam edebilir.';

/**
 * Only ever called from a page that already confirmed the Mentor has at
 * least one active alert — per Section 6.4, Groq must never be called merely
 * to manufacture commentary over an empty/healthy alert state.
 */
export async function generateMentorAlertExplainerAction(forceRegenerate: boolean): Promise<AiActionState> {
  const context = await requireAuthContext();
  try {
    const result = await getMentorAlertExplainerInsight(context.scope, { id: context.user.id, name: context.user.fullName }, { forceRegenerate });
    if (result.status === 'no_alerts' || result.status === 'unavailable') return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
    return { status: 'ok', insight: result.insight, cached: result.cached };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
}
