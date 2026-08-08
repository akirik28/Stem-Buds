'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import {
  deleteMessage,
  listNewChannelMessages,
  markChannelRead,
  postMessage,
  setMessagePinned,
  type MessageWithAuthor,
} from '@/server/services/messaging-service';
import { toUserMessage } from '@/server/errors';

export type MessageActionState = { error?: string; success?: string };

export async function postMessageAction(
  channelId: string,
  parentMessageId: string | null,
  _prev: MessageActionState,
  formData: FormData,
): Promise<MessageActionState> {
  const context = await requireAuthContext();
  try {
    await postMessage({
      scope: context.scope,
      channelId,
      body: String(formData.get('body') ?? ''),
      parentMessageId,
      isAnnouncement: formData.get('isAnnouncement') === 'on',
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath(`/panel/mesajlar/${channelId}`);
    return { success: undefined };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function markChannelReadAction(channelId: string): Promise<void> {
  const context = await requireAuthContext();
  await markChannelRead(context.scope, channelId);
  revalidatePath('/panel/mesajlar');
}

export async function pollNewMessagesAction(channelId: string, sinceIso: string): Promise<{ messages: MessageWithAuthor[]; nowIso: string }> {
  const context = await requireAuthContext();
  const since = new Date(sinceIso);
  const newMessages = await listNewChannelMessages(context.scope, channelId, since);
  return { messages: newMessages, nowIso: new Date().toISOString() };
}

export async function setMessagePinnedAction(messageId: string, pinned: boolean, channelId: string): Promise<MessageActionState> {
  const context = await requireAuthContext();
  try {
    await setMessagePinned({ scope: context.scope, messageId, pinned, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/mesajlar/${channelId}`);
    return {};
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteMessageAction(messageId: string, channelId: string): Promise<MessageActionState> {
  const context = await requireAuthContext();
  try {
    await deleteMessage({ scope: context.scope, messageId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/mesajlar/${channelId}`);
    return {};
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
