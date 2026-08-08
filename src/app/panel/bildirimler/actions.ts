'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import { markAllNotificationsRead, markNotificationRead } from '@/server/services/notification-service';
import { toUserMessage } from '@/server/errors';

export type NotificationActionState = { error?: string };

export async function markNotificationReadAction(notificationId: string): Promise<NotificationActionState> {
  const context = await requireAuthContext();
  try {
    await markNotificationRead(notificationId, context.user.id);
    revalidatePath('/panel/bildirimler');
    return {};
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function markAllNotificationsReadAction(): Promise<NotificationActionState> {
  const context = await requireAuthContext();
  try {
    await markAllNotificationsRead(context.user.id);
    revalidatePath('/panel/bildirimler');
    return {};
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
