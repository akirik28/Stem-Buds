import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';
import { messages } from '@/lib/i18n/tr';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Platforma Giriş',
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const context = await getAuthContext();
  if (context) {
    redirect(context.user.mustChangePassword ? '/sifre-belirle' : '/panel');
  }

  return (
    <div className="rounded-[--radius-card] bg-surface p-6 shadow-xl sm:p-8">
      <h1 className="text-xl font-semibold text-ink">{messages.auth.loginTitle}</h1>
      <p className="mt-1 text-sm text-ink-3">
        Kullanıcı adın ve şifrenle giriş yap.
      </p>

      <LoginForm />

      <p className="mt-6 border-t border-line-soft pt-4 text-xs leading-relaxed text-ink-3">
        {messages.auth.noPublicRegistration}
      </p>
    </div>
  );
}
