'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import { submitComplaint } from '@/server/services/complaint-service';
import { submitContinuousFeedback, submitFeedbackResponse } from '@/server/services/feedback-service';
import { toUserMessage } from '@/server/errors';
import type { ContinuousFeedback } from '@/server/services/feedback-service';
import type { Complaint } from '@/server/services/complaint-service';

export type ActionState = { error?: string; success?: string };

function ratingFromForm(formData: FormData, field: string): number {
  return Number(formData.get(field));
}

export async function submitFeedbackCycleResponseAction(cycleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  try {
    await submitFeedbackResponse({
      cycleId,
      ratingMentorGuidance: ratingFromForm(formData, 'ratingMentorGuidance'),
      ratingSessionProductivity: ratingFromForm(formData, 'ratingSessionProductivity'),
      ratingSupport: ratingFromForm(formData, 'ratingSupport'),
      ratingGroupProgress: ratingFromForm(formData, 'ratingGroupProgress'),
      mostUseful: String(formData.get('mostUseful') ?? ''),
      wantChanged: String(formData.get('wantChanged') ?? ''),
      chapterHeadNote: String(formData.get('chapterHeadNote') ?? ''),
      scope: context.scope,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/geri-bildirim');
    return { success: 'Değerlendirmeniz için teşekkürler.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function submitContinuousFeedbackAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  try {
    const groupId = String(formData.get('groupId') ?? '');
    await submitContinuousFeedback({
      scope: context.scope,
      category: formData.get('category') as ContinuousFeedback['category'],
      message: String(formData.get('message') ?? ''),
      isAnonymous: formData.get('isAnonymous') === 'on',
      groupId: groupId.length > 0 ? groupId : null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    return { success: 'Geri bildiriminiz iletildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function submitComplaintAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  try {
    await submitComplaint({
      scope: context.scope,
      category: formData.get('category') as Complaint['category'],
      subject: String(formData.get('subject') ?? ''),
      body: String(formData.get('body') ?? ''),
      isAnonymous: formData.get('isAnonymous') === 'on',
      actor: { id: context.user.id, name: context.user.fullName },
    });
    return { success: 'Şikâyetiniz iletildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
