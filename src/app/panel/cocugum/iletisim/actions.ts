'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import { sendParentMessage, setMonthlyDigest } from '@/server/services/parent-service';
import { toUserMessage } from '@/server/errors';

export type ParentActionState = { error?: string; success?: string };

export async function sendParentMessageAction(
  studentUserId: string,
  kind: 'question' | 'excuse',
  _prev: ParentActionState,
  formData: FormData,
): Promise<ParentActionState> {
  const context = await requireAuthContext();
  try {
    await sendParentMessage(context.scope, {
      studentUserId,
      kind,
      body: String(formData.get('body') ?? ''),
    });
    revalidatePath('/panel/cocugum/iletisim');
    return {
      success:
        kind === 'excuse'
          ? 'Mazeret bildiriminiz program yönetimine iletildi.'
          : 'Sorunuz program yönetimine iletildi.',
    };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function setMonthlyDigestAction(
  studentUserId: string,
  enabled: boolean,
): Promise<ParentActionState> {
  const context = await requireAuthContext();
  try {
    await setMonthlyDigest(context.scope, studentUserId, enabled);
    revalidatePath('/panel/cocugum/iletisim');
    return { success: enabled ? 'Aylık bilgilendirme açıldı.' : 'Aylık bilgilendirme kapatıldı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
