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
    <div className="rounded-[--radius-card] bg-white p-6 shadow-xl sm:p-8">
      <h1 className="text-xl font-semibold text-navy-900">{messages.auth.loginTitle}</h1>
      <p className="mt-1 text-sm text-navy-500">
        Kullanıcı adın ve şifrenle giriş yap.
      </p>

      <LoginForm />

      <p className="mt-6 border-t border-navy-100 pt-4 text-xs leading-relaxed text-navy-500">
        {messages.auth.noPublicRegistration}
      </p>
    </div>
  );
}
