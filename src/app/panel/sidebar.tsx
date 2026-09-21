'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { messages } from '@/lib/i18n/tr';
import { logoutAction } from '../(auth)/actions';
import type { NavGroup } from './navigation';

export type SidebarUser = {
  fullName: string;
  roleLabel: string;
  /** One line describing what this account can reach, e.g. "3 grup · UAA". */
  scope: string;
  initials: string;
  tintClass: string;
  inkClass: string;
};

/** `/panel` is a prefix of every other panel route, so it only ever matches exactly. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/panel') return pathname === '/panel';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ groups, user }: { groups: NavGroup[]; user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[258px] flex-none flex-col gap-5 overflow-y-auto border-r border-line bg-surface px-3.5 py-5 lg:flex">
      <Link href="/panel" className="flex items-center gap-2.5 rounded-xl px-1.5">
        <span className="grid size-[38px] flex-none place-items-center overflow-hidden rounded-xl border border-line bg-surface-2">
          <Image
            src="/brand/stem-buds-icon.png"
            alt=""
            width={22}
            height={29}
            className="h-[29px] w-[22px] object-contain"
          />
        </span>
        <span>
          <span className="block font-sans text-[13px]/[1.1] font-bold text-ink">STEM &amp; BUDS</span>
          <span className="mt-[3px] block font-sans text-[9px]/none font-semibold uppercase tracking-[0.3em] text-ink-3">
            Türkiye
          </span>
        </span>
      </Link>

      <div className="flex flex-col gap-2.5 rounded-[15px] border border-line bg-surface-2 p-[13px]">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'grid size-[34px] flex-none place-items-center rounded-[11px] text-[12px] font-bold',
              user.tintClass,
              user.inkClass,
            )}
          >
            {user.initials}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px]/[1.2] font-semibold text-ink">{user.fullName}</div>
            <div className={cn('text-[11px]/[1.3] font-medium', user.inkClass)}>{user.roleLabel}</div>
          </div>
        </div>
        <div className="flex items-center gap-[7px] rounded-[10px] bg-surface px-2.5 py-[7px] text-[11px]/[1.3] font-medium text-ink-2">
          <span aria-hidden="true" className="text-ink-3">
            ◎
          </span>
          {user.scope}
        </div>
      </div>

      <nav aria-label="Panel menüsü" className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.title} className="flex flex-col gap-0.5">
            <div className="px-2.5 pb-[7px] text-[9px]/none font-bold uppercase tracking-[0.18em] text-ink-3">
              {group.title}
            </div>
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // Every panel destination is dynamic and database-backed;
                  // prefetching a whole Executive menu would fan out into a
                  // burst of queries nobody asked for.
                  prefetch={false}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-[9px] rounded-r-[11px] border-l-[3px] px-2.5 text-[13px] transition-colors',
                    active
                      ? 'border-l-accent bg-surface-2 font-semibold text-ink'
                      : 'border-l-transparent font-medium text-ink-2 hover:bg-surface-2 hover:text-ink',
                  )}
                >
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="h-[21px] min-w-[21px] flex-none rounded-full bg-surface-3 px-1.5 text-center text-[10px]/[21px] font-bold text-ink-2">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <form action={logoutAction} className="mt-auto">
        <button
          type="submit"
          className="min-h-[38px] w-full rounded-[11px] border border-dashed border-line px-3 text-left text-[12px] font-semibold text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
        >
          {messages.auth.logout}
        </button>
      </form>
    </aside>
  );
}
