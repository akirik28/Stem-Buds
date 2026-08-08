import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthContext } from '@/server/auth/context';
import { BrandLockup } from '@/components/brand/logo';
import { roleLabels } from '@/lib/i18n/tr';
import { LogoutButton } from './logout-button';
import { PlatformNav } from './platform-nav';
import { buildNavigation } from './navigation';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect('/giris');
  if (context.user.mustChangePassword) redirect('/sifre-belirle');

  const navigation = buildNavigation(context.scope);

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50">
      <header className="sticky top-0 z-30 border-b border-navy-100 bg-white">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link href="/panel" className="flex rounded-lg">
            <BrandLockup size="sm" />
          </Link>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-navy-900">{context.user.fullName}</p>
              <p className="text-xs text-navy-500">{roleLabels[context.user.role]}</p>
            </div>
            <LogoutButton />
          </div>
        </div>

        <PlatformNav items={navigation} />
      </header>

      <main id="main" className="container-page flex-1 py-6">
        {children}
      </main>
    </div>
  );
}
