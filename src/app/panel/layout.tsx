import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';
import { getActiveSession } from '@/server/services/class-mode-service';
import { roleLabels } from '@/lib/i18n/tr';
import { initials, roleTheme } from '@/lib/role-theme';
import { buildNavigation } from './navigation';
import { describeScope } from './scope-line';
import { Sidebar, type SidebarUser } from './sidebar';
import { MobileHeader, MobileTabBar } from './mobile-nav';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect('/giris');
  if (context.user.mustChangePassword) redirect('/sifre-belirle');

  // While a session is running there is one thing to do, so the panel hands
  // over to the lesson guide entirely rather than competing with it. Class
  // mode lives outside this layout, so this cannot loop.
  if (await getActiveSession(context.scope)) redirect('/ders');

  const groups = buildNavigation(context.scope);
  const theme = roleTheme(context.user.role);
  const user: SidebarUser = {
    fullName: context.user.fullName,
    roleLabel: roleLabels[context.user.role],
    scope: await describeScope(context.scope),
    initials: initials(context.user.fullName),
    tintClass: theme.tint,
    inkClass: theme.ink,
  };

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg">
      {/*
       * Two decorative light layers, both first in paint order so every
       * surface above them stays legible: `edge` is the still gradient bled
       * in from the frame, `lamp` the slow drift underneath it.
       */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [background-image:var(--edge)]"
      />
      <div aria-hidden="true" className="aura-lamp" />

      <div className="relative flex min-h-0 flex-1">
        <Sidebar groups={groups} user={user} />

        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader groups={groups} user={user} />

          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex max-w-[1160px] flex-col gap-5 px-4 pb-[26px] pt-[18px] lg:px-[34px] lg:pb-11 lg:pt-[30px]">
              {children}
            </div>
          </main>

          <MobileTabBar groups={groups} />
        </div>
      </div>
    </div>
  );
}
