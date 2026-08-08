'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext, assertPermission } from '@/server/auth/context';
import { canDeleteMilestone, canManageProject } from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { getGroupById } from '@/server/services/group-service';
import {
  addMilestone,
  createProject,
  deleteMilestone,
  getMilestoneById,
  getProjectById,
  getProjectByGroupId,
  updateMilestoneStatus,
  updateProjectDetails,
  updateProjectOutcome,
  updateProjectStatus,
  type Project,
} from '@/server/services/project-service';
import { toUserMessage } from '@/server/errors';

export type ActionState = { error?: string; success?: string };

async function loadContextFor(chapterId: string, groupId: string) {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  const group = await getGroupById(groupId);
  if (!chapter || !group || group.chapterId !== chapter.id) {
    throw new Error('not_found');
  }
  assertPermission(canManageProject(context.scope, groupId, chapter.id));
  return { context, chapter, group };
}

function revalidateProject(chapterId: string, groupId: string) {
  revalidatePath(`/panel/gruplar/${chapterId}/${groupId}/proje`);
  revalidatePath(`/panel/gruplar/${chapterId}/${groupId}`);
  revalidatePath('/panel/projeler');
}

export async function createProjectAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context } = await loadContextFor(chapterId, groupId);
  if (!context.academicYearId) return { error: 'Aktif akademik yıl bulunamadı.' };

  try {
    await createProject({
      groupId,
      academicYearId: context.academicYearId,
      name: String(formData.get('name') ?? ''),
      shortDescription: String(formData.get('shortDescription') ?? '') || null,
      researchQuestion: String(formData.get('researchQuestion') ?? '') || null,
      purpose: String(formData.get('purpose') ?? '') || null,
      startDate: String(formData.get('startDate') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateProject(chapterId, groupId);
    return { success: 'Proje oluşturuldu.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

async function requireProject(groupId: string, academicYearId: string): Promise<Project> {
  const project = await getProjectByGroupId(groupId, academicYearId);
  if (!project) throw new Error('not_found');
  return project;
}

export async function updateProjectDetailsAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context } = await loadContextFor(chapterId, groupId);
  if (!context.academicYearId) return { error: 'Aktif akademik yıl bulunamadı.' };

  try {
    const project = await requireProject(groupId, context.academicYearId);
    await updateProjectDetails({
      projectId: project.id,
      name: String(formData.get('name') ?? ''),
      shortDescription: String(formData.get('shortDescription') ?? '') || null,
      researchQuestion: String(formData.get('researchQuestion') ?? '') || null,
      purpose: String(formData.get('purpose') ?? '') || null,
      startDate: String(formData.get('startDate') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateProject(chapterId, groupId);
    return { success: 'Kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateProjectStatusAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context } = await loadContextFor(chapterId, groupId);
  if (!context.academicYearId) return { error: 'Aktif akademik yıl bulunamadı.' };

  const health = String(formData.get('health') ?? '');
  if (health !== 'on_track' && health !== 'attention' && health !== 'delayed') {
    return { error: 'Geçerli bir proje durumu seçin.' };
  }

  try {
    const project = await requireProject(groupId, context.academicYearId);
    await updateProjectStatus({
      projectId: project.id,
      health,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateProject(chapterId, groupId);
    return { success: 'Proje durumu güncellendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateProjectOutcomeAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context } = await loadContextFor(chapterId, groupId);
  if (!context.academicYearId) return { error: 'Aktif akademik yıl bulunamadı.' };

  try {
    const project = await requireProject(groupId, context.academicYearId);
    await updateProjectOutcome({
      projectId: project.id,
      outcomeSummary: String(formData.get('outcomeSummary') ?? '') || null,
      finalDelivered: formData.get('finalDelivered') === 'on',
      externalReferenceUrl: String(formData.get('externalReferenceUrl') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateProject(chapterId, groupId);
    return { success: 'Kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function addMilestoneAction(
  chapterId: string,
  groupId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { context } = await loadContextFor(chapterId, groupId);
  if (!context.academicYearId) return { error: 'Aktif akademik yıl bulunamadı.' };

  try {
    const project = await requireProject(groupId, context.academicYearId);
    await addMilestone({
      projectId: project.id,
      title: String(formData.get('title') ?? ''),
      description: String(formData.get('description') ?? '') || null,
      dueDate: String(formData.get('dueDate') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateProject(chapterId, groupId);
    return { success: 'Milestone eklendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteMilestoneAction(
  chapterId: string,
  groupId: string,
  milestoneId: string,
): Promise<ActionState> {
  const context = await requireAuthContext();
  const chapter = await getChapterById(chapterId);
  const group = await getGroupById(groupId);
  if (!chapter || !group || group.chapterId !== chapter.id) {
    throw new Error('not_found');
  }

  try {
    const milestone = await getMilestoneById(milestoneId);
    if (!milestone) return { error: 'Milestone bulunamadı.' };
    const project = await getProjectById(milestone.projectId);
    if (!project || project.groupId !== groupId) return { error: 'Milestone bulunamadı.' };

    assertPermission(
      canDeleteMilestone(context.scope, {
        groupId,
        chapterId: chapter.id,
        createdByUserId: milestone.createdById,
      }),
    );

    await deleteMilestone({ milestoneId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidateProject(chapterId, groupId);
    return { success: 'Milestone silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateMilestoneStatusAction(
  chapterId: string,
  groupId: string,
  milestoneId: string,
  status: 'planned' | 'in_progress' | 'completed',
): Promise<ActionState> {
  const { context } = await loadContextFor(chapterId, groupId);

  try {
    await updateMilestoneStatus({
      milestoneId,
      status,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidateProject(chapterId, groupId);
    return { success: 'Milestone güncellendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
