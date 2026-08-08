'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import { setAlertWorkflowStatus } from '@/server/services/alert-query';
import { getChapterGroupStatusInsight, getDataQuestionInsight, getWeeklySummaryInsight } from '@/server/services/management-ai';
import { toUserMessage } from '@/server/errors';
import type { AiManagementInsight } from '@/server/ai/insight-schema';

export type AlertActionState = { error?: string; success?: string };

export async function setAlertStatusAction(alertId: string, status: 'investigating' | 'closed'): Promise<AlertActionState> {
  const context = await requireAuthContext();
  try {
    await setAlertWorkflowStatus({
      alertId,
      status,
      scope: context.scope,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/yonetim-akisi');
    revalidatePath('/panel/dikkat-gerektirenler');
    return { success: status === 'investigating' ? 'İnceleniyor olarak işaretlendi.' : 'Kapatıldı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export type AiActionState =
  | { status: 'ok'; insight: AiManagementInsight; cached: boolean }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

const UNAVAILABLE_MESSAGE = 'AI özeti şu anda oluşturulamadı. Mevcut veriler ve uyarılar kullanılmaya devam edebilir.';

export async function generateWeeklySummaryAction(programId: string | null, forceRegenerate: boolean): Promise<AiActionState> {
  const context = await requireAuthContext();
  try {
    const result = await getWeeklySummaryInsight(context.scope, programId, { id: context.user.id, name: context.user.fullName }, { forceRegenerate });
    if (result.status === 'unavailable') return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
    return { status: 'ok', insight: result.insight, cached: result.cached };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
}

export async function generateChapterGroupStatusAction(chapterId: string, forceRegenerate: boolean): Promise<AiActionState> {
  const context = await requireAuthContext();
  try {
    const result = await getChapterGroupStatusInsight(context.scope, chapterId, { id: context.user.id, name: context.user.fullName }, { forceRegenerate });
    if (result.status === 'unavailable') return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
    return { status: 'ok', insight: result.insight, cached: result.cached };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
}

export async function askDataQuestionAction(question: string, programId: string | null): Promise<AiActionState> {
  const context = await requireAuthContext();
  try {
    const result = await getDataQuestionInsight(context.scope, question, programId, { id: context.user.id, name: context.user.fullName });
    if (result.status === 'unavailable') return { status: 'unavailable', message: UNAVAILABLE_MESSAGE };
    return { status: 'ok', insight: result.insight, cached: result.cached };
  } catch (error) {
    return { status: 'error', message: toUserMessage(error) };
  }
}
