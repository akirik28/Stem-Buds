'use server';

import { headers } from 'next/headers';
import { submitContactMessage } from '@/server/services/public-site-service';
import { toUserMessage } from '@/server/errors';
import type { ContactReason } from '@/lib/i18n/tr';

export type ContactFormState = { error?: string; success?: boolean };

export async function submitContactFormAction(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  try {
    await submitContactMessage({
      fullName: String(formData.get('fullName') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? '') || null,
      reason: formData.get('reason') as ContactReason,
      message: String(formData.get('message') ?? ''),
      requestHeaders: await headers(),
    });
    return { success: true };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
