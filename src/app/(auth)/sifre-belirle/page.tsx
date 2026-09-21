import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';
import { messages } from '@/lib/i18n/tr';
import { ChangePasswordForm } from './change-password-form';

export const metadata: Metadata = {
  title: 'Şifreni Belirle',
  robots: { index: false, follow: false },
};

export default async function ForcedPasswordChangePage() {
  const context = await getAuthContext();
  if (!context) redirect('/giris');
  if (!context.user.mustChangePassword) redirect('/panel');

  return (
    <div className="rounded-[--radius-card] bg-surface p-6 shadow-xl sm:p-8">
      <h1 className="text-xl font-semibold text-ink">
        {messages.auth.mustChangePasswordTitle}
      </h1>
      <p className="mt-1 text-sm text-ink-3">{messages.auth.mustChangePasswordDescription}</p>

      <ChangePasswordForm requireCurrentPassword={false} />
    </div>
  );
}
