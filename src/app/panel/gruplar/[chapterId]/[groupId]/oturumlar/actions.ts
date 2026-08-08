'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext, assertPermission } from '@/server/auth/context';
import {
  canEditWeeklyNarrative,
  canFinalizeWeeklyRecord,
  canApproveWeeklySession,
  canDeleteHomeworkAssignment,
} from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { getGroupById } from '@/server/services/group-service';
import {
  cancelWeeklySession,
  deleteWeeklySession,
  generateWeeklySessionsForGroup,
} from '@/server/services/weekly-session-service';
import {
  approveWeeklySession,
  deleteHomeworkAssignment,
  finalizeAttendance,
  finalizePreviousHomeworkResults,
  getHomeworkAssignmentById,
  setHomeworkDecision,
  updateWorkLogNarrative,
  type AttendanceInput,
} from '@/server/services/weekly-work-service';
import { toUserMessage } from '@/server/errors';

export type ActionState = { error?: string; success?: string };

async function loadContextFor(chapterId: string, groupId: string) {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  const group = await getGroupById(groupId);
  if (!chapter || !group || group.chapterId !== chapter.id) {
    throw new Error('not_found');
  }
  return { context, chapter, group };
}

function revalidateSession(chapterId: string, groupId: string, sessionId: string) {
  revalidatePath(`/panel/gruplar/${chapterId}/${groupId}/oturumlar/${sessionId}`);
  revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
}

export async function generateSessionsAction(chapterId: string, groupId: string): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canFinalizeWeeklyRecord(context.scope, groupId, chapter.id));

  try {
    const result = await generateWeeklySessionsForGroup(groupId);
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    if (result.reason === 'not_configured') {
      return { error: 'Programın haftalık çalışma saati henüz belirlenmedi. Önce Ayarlar sayfasından belirleyin.' };
    }
    return { success: `${result.created} oturum oluşturuldu.` };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateNarrativeAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canEditWeeklyNarrative(context.scope, groupId, chapter.id));

  const projectHealthRaw = String(formData.get('projectHealth') ?? '');
  const projectHealth =
    projectHealthRaw === 'on_track' || projectHealthRaw === 'attention' || projectHealthRaw === 'delayed'
      ? projectHealthRaw
      : null;

  try {
    await updateWorkLogNarrative({
      weeklySessionId: sessionId,
      whatWeDid: String(formData.get('whatWeDid') ?? ''),
      outputs: String(formData.get('outputs') ?? ''),
      problems: String(formData.get('problems') ?? ''),
      nextWeekGoal: String(formData.get('nextWeekGoal') ?? ''),
      projectHealth,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function finalizeAttendanceAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canFinalizeWeeklyRecord(context.scope, groupId, chapter.id));

  const membershipIds = formData.getAll('membershipId').map(String);
  const records: AttendanceInput[] = membershipIds.map((id) => ({
    groupMembershipId: id,
    status: String(formData.get(`status-${id}`) ?? 'present') as AttendanceInput['status'],
    note: String(formData.get(`note-${id}`) ?? '') || null,
  }));

  try {
    await finalizeAttendance({ weeklySessionId: sessionId, records, actor: { id: context.user.id, name: context.user.fullName } });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Katılım kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function setHomeworkAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canFinalizeWeeklyRecord(context.scope, groupId, chapter.id));

  const noHomework = formData.get('noHomework') === 'on';

  try {
    await setHomeworkDecision({
      weeklySessionId: sessionId,
      noHomework,
      description: String(formData.get('description') ?? ''),
      dueDate: String(formData.get('dueDate') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Ödev kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteSessionAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canFinalizeWeeklyRecord(context.scope, groupId, chapter.id));

  try {
    await deleteWeeklySession({ weeklySessionId: sessionId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
    return { success: 'Oturum silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function cancelSessionAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canFinalizeWeeklyRecord(context.scope, groupId, chapter.id));

  try {
    await cancelWeeklySession({ weeklySessionId: sessionId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Oturum iptal edildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteHomeworkAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
  assignmentId: string,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);

  try {
    const assignment = await getHomeworkAssignmentById(assignmentId);
    if (!assignment || assignment.groupId !== groupId || assignment.weeklySessionId !== sessionId) {
      return { error: 'Ödev bulunamadı.' };
    }

    assertPermission(
      canDeleteHomeworkAssignment(context.scope, {
        groupId,
        chapterId: chapter.id,
        createdByUserId: assignment.createdById,
      }),
    );

    await deleteHomeworkAssignment({
      assignmentId,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Ödev silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function finalizePreviousHomeworkAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canFinalizeWeeklyRecord(context.scope, groupId, chapter.id));

  const membershipIds = formData.getAll('membershipId').map(String);
  const statuses = membershipIds.map((id) => ({
    groupMembershipId: id,
    status: String(formData.get(`status-${id}`) ?? 'not_done') as 'done' | 'not_done' | 'excused',
    note: String(formData.get(`note-${id}`) ?? '') || null,
  }));

  try {
    await finalizePreviousHomeworkResults({
      weeklySessionId: sessionId,
      statuses,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Ödev sonuçları kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function approveSessionAction(
  chapterId: string,
  groupId: string,
  sessionId: string,
): Promise<ActionState> {
  const { context, chapter } = await loadContextFor(chapterId, groupId);
  assertPermission(canApproveWeeklySession(context.scope, groupId, chapter.id));

  try {
    await approveWeeklySession({ weeklySessionId: sessionId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidateSession(chapterId, groupId, sessionId);
    return { success: 'Oturum onaylandı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
