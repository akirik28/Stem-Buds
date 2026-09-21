'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import { escalateIssue, reportIssue, resolveIssue } from '@/server/services/issue-service';
import { toUserMessage } from '@/server/errors';

export type IssueActionState = { error?: string; success?: string };

/**
 * Every one of these re-checks authorization inside the service — the
 * service is where "is this issue currently yours?" lives, and neither the
 * form nor this file is allowed to decide it.
 */

export async function reportIssueAction(
  groupId: string,
  _state: IssueActionState,
  formData: FormData,
): Promise<IssueActionState> {
  const context = await requireAuthContext();
  try {
    await reportIssue(
      context.scope,
      { groupId, body: String(formData.get('body') ?? '') },
      { id: context.user.id, name: context.user.fullName },
    );
    revalidatePath('/panel/yapilacaklar');
    revalidatePath('/panel');
    return { success: 'İletildi. Önce mentöre gitti.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function escalateIssueAction(issueId: string): Promise<IssueActionState> {
  const context = await requireAuthContext();
  try {
    await escalateIssue(context.scope, issueId, { id: context.user.id, name: context.user.fullName });
    revalidatePath('/panel/yapilacaklar');
    revalidatePath('/panel');
    return { success: 'Bir üst seviyeye iletildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function resolveIssueAction(
  issueId: string,
  note: string,
): Promise<IssueActionState> {
  const context = await requireAuthContext();
  try {
    await resolveIssue(context.scope, issueId, note, { id: context.user.id, name: context.user.fullName });
    revalidatePath('/panel/yapilacaklar');
    revalidatePath('/panel');
    return { success: 'Kapatıldı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
