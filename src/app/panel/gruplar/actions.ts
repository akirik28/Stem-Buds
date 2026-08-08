'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext, assertPermission } from '@/server/auth/context';
import { canManageChapter, isExecutive } from '@/server/authz/policy';
import {
  archiveChapter,
  createChapter,
  deleteChapter,
  getChapterById,
  reactivateChapter,
} from '@/server/services/chapter-service';
import {
  archiveGroup,
  assignGroupMentor,
  createGroup,
  addGroupMember,
  deleteGroup,
  reactivateGroup,
  removeGroupMember,
  setTeamLeader,
} from '@/server/services/group-service';
import type { DisciplineKey } from '@/lib/i18n/tr';
import { toUserMessage } from '@/server/errors';

export type ActionState = { error?: string; success?: string };

export async function createChapterAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(isExecutive(context.scope.role));

  try {
    await createChapter({
      programId: String(formData.get('programId') ?? ''),
      code: String(formData.get('code') ?? ''),
      name: String(formData.get('name') ?? ''),
      city: String(formData.get('city') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/gruplar');
    return { success: 'Chapter oluşturuldu.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function createGroupAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapterId = String(formData.get('chapterId') ?? '');
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));
  if (!context.academicYearId) return { error: 'Aktif akademik yıl bulunmuyor.' };

  try {
    await createGroup({
      chapterId,
      academicYearId: context.academicYearId,
      disciplineKey: String(formData.get('disciplineKey') ?? '') as DisciplineKey,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath(`/panel/gruplar/${chapterId}`);
    return { success: 'Grup oluşturuldu.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function addGroupMemberAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  // Mentor assignment only ever goes through `assignGroupMentorAction`, the
  // one path that keeps `groups.mentorUserId` in sync — this form is
  // students-only even though the underlying service could technically take
  // either role.
  const role = String(formData.get('role') ?? 'student');
  if (role !== 'student') {
    return { error: 'Mentor ataması için “Mentor” bölümündeki formu kullanın.' };
  }

  try {
    await addGroupMember({
      groupId,
      userId: String(formData.get('userId') ?? ''),
      role: 'student',
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: 'Üye eklendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function removeGroupMemberAction(
  chapterId: string,
  groupId: string,
  membershipId: string,
): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  try {
    await removeGroupMember({ membershipId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: 'Üye çıkarıldı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function setTeamLeaderAction(
  chapterId: string,
  groupId: string,
  membershipId: string,
  isTeamLeader: boolean,
): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  try {
    await setTeamLeader({ membershipId, isTeamLeader, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: isTeamLeader ? 'Takım Lideri atandı.' : 'Takım Lideri yetkisi kaldırıldı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function assignGroupMentorAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  try {
    await assignGroupMentor({
      groupId,
      mentorUserId: String(formData.get('mentorUserId') ?? ''),
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: 'Mentor atandı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function archiveChapterAction(chapterId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageChapter(context.scope, chapterId));

  try {
    await archiveChapter({ id: chapterId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath('/panel/gruplar');
    revalidatePath(`/panel/gruplar/${chapterId}`);
    return { success: 'Chapter pasifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function reactivateChapterAction(chapterId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageChapter(context.scope, chapterId));

  try {
    await reactivateChapter({ id: chapterId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath('/panel/gruplar');
    revalidatePath(`/panel/gruplar/${chapterId}`);
    return { success: 'Chapter yeniden aktifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteChapterAction(chapterId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageChapter(context.scope, chapterId));

  try {
    await deleteChapter({ id: chapterId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath('/panel/gruplar');
    return { success: 'Chapter silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function archiveGroupAction(chapterId: string, groupId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  try {
    await archiveGroup({ id: groupId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/gruplar/${chapterId}`);
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: 'Grup pasifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function reactivateGroupAction(chapterId: string, groupId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  try {
    await reactivateGroup({ id: groupId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/gruplar/${chapterId}`);
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: 'Grup yeniden aktifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteGroupAction(chapterId: string, groupId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  assertPermission(!!chapter && canManageChapter(context.scope, chapter.id));

  try {
    await deleteGroup({ id: groupId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/gruplar/${chapterId}`);
    return { success: 'Grup silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
