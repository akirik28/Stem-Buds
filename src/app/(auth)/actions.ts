'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';
import { destroySession, sessionCookieName, sessionCookieOptions } from '@/server/auth/session';
import { changeOwnPassword, login } from '@/server/services/auth-service';
import { clientIpFromHeaders, hashIp } from '@/server/services/rate-limit';
import { toUserMessage } from '@/server/errors';
import { messages } from '@/lib/i18n/tr';

export type FormState = { error?: string; success?: string };

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');

  const requestHeaders = await headers();
  let mustChangePassword = false;

  try {
    const result = await login({
      username,
      password,
      ipHash: hashIp(clientIpFromHeaders(requestHeaders)),
      userAgent: requestHeaders.get('user-agent'),
    });
    mustChangePassword = result.mustChangePassword;

    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName(), result.sessionToken, sessionCookieOptions());
  } catch (error) {
    return { error: toUserMessage(error) };
  }

  redirect(mustChangePassword ? '/sifre-belirle' : '/panel');
}

export async function logoutAction(): Promise<void> {
  const context = await getAuthContext();
  if (context) {
    await destroySession(context.sessionId);
  }
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName());
  redirect('/giris');
}

export async function changePasswordAction(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const context = await getAuthContext();
  if (!context) redirect('/giris');

  try {
    const result = await changeOwnPassword({
      userId: context.user.id,
      currentSessionId: context.sessionId,
      currentPassword: context.user.mustChangePassword
        ? null
        : String(formData.get('currentPassword') ?? ''),
      newPassword: String(formData.get('newPassword') ?? ''),
      newPasswordRepeat: String(formData.get('newPasswordRepeat') ?? ''),
    });

    // The old session (this one included) was invalidated; the browser needs
    // the freshly rotated cookie or the very next request would be logged out.
    const cookieStore = await cookies();
    cookieStore.set(sessionCookieName(), result.sessionToken, sessionCookieOptions());
  } catch (error) {
    return { error: toUserMessage(error) };
  }

  if (context.user.mustChangePassword) {
    redirect('/panel');
  }

  return { success: messages.auth.passwordChanged };
}
