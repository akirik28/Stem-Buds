'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext, assertPermission } from '@/server/auth/context';
import { canManagePublicContent } from '@/server/authz/policy';
import {
  deleteHighlight,
  deleteLeadershipProfile,
  deleteNewsPost,
  deletePublicMedia,
  createNewsPost,
  markContactMessageHandled,
  setNewsPublished,
  updateNewsPost,
  uploadPublicMedia,
  upsertHighlight,
  upsertLeadershipProfile,
} from '@/server/services/public-site-admin-service';
import { toUserMessage } from '@/server/errors';

export type ActionState = { error?: string; success?: string };

async function requireManageContext() {
  const context = await requireAuthContext();
  assertPermission(canManagePublicContent(context.scope));
  return context;
}

function revalidatePublicSite() {
  revalidatePath('/panel/site-icerikleri');
  revalidatePath('/');
  revalidatePath('/haberler');
}

export async function upsertHighlightAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    const id = String(formData.get('id') ?? '') || undefined;
    await upsertHighlight({
      id,
      key: String(formData.get('key') ?? ''),
      title: String(formData.get('title') ?? ''),
      body: String(formData.get('body') ?? ''),
      displayOrder: Number(formData.get('displayOrder') ?? 0) || 0,
      isPublic: formData.get('isPublic') === 'on',
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePublicSite();
    return { success: id ? 'Güncellendi.' : 'Eklendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteHighlightAction(id: string): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await deleteHighlight(id, { id: context.user.id, name: context.user.fullName });
    revalidatePublicSite();
    return { success: 'Silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function upsertLeadershipAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    const id = String(formData.get('id') ?? '') || undefined;
    await upsertLeadershipProfile({
      id,
      fullName: String(formData.get('fullName') ?? ''),
      title: String(formData.get('title') ?? ''),
      bio: String(formData.get('bio') ?? ''),
      displayOrder: Number(formData.get('displayOrder') ?? 0) || 0,
      isPublic: formData.get('isPublic') === 'on',
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePublicSite();
    return { success: id ? 'Güncellendi.' : 'Eklendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteLeadershipAction(id: string): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await deleteLeadershipProfile(id, { id: context.user.id, name: context.user.fullName });
    revalidatePublicSite();
    return { success: 'Silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function createNewsAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await createNewsPost({
      title: String(formData.get('title') ?? ''),
      summary: String(formData.get('summary') ?? ''),
      body: String(formData.get('body') ?? ''),
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePublicSite();
    return { success: 'Haber oluşturuldu.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateNewsAction(id: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await updateNewsPost({
      id,
      title: String(formData.get('title') ?? ''),
      summary: String(formData.get('summary') ?? ''),
      body: String(formData.get('body') ?? ''),
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePublicSite();
    return { success: 'Kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function setNewsPublishedAction(id: string, isPublished: boolean): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await setNewsPublished(id, isPublished, { id: context.user.id, name: context.user.fullName });
    revalidatePublicSite();
    return { success: isPublished ? 'Yayınlandı.' : 'Yayından kaldırıldı.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteNewsAction(id: string): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await deleteNewsPost(id, { id: context.user.id, name: context.user.fullName });
    revalidatePublicSite();
    return { success: 'Silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function uploadMediaAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    const file = formData.get('file');
    if (!(file instanceof File)) return { error: 'Bir dosya seçin.' };
    const altText = String(formData.get('altText') ?? '');
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadPublicMedia({
      fileName: file.name,
      contentType: file.type,
      bytes,
      altText,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePublicSite();
    return { success: 'Görsel yüklendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteMediaAction(id: string): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await deletePublicMedia(id, { id: context.user.id, name: context.user.fullName });
    revalidatePublicSite();
    return { success: 'Silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function markContactHandledAction(id: string): Promise<ActionState> {
  const context = await requireManageContext();
  try {
    await markContactMessageHandled(id, { id: context.user.id, name: context.user.fullName });
    revalidatePath('/panel/site-icerikleri');
    return { success: 'İşaretlendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
