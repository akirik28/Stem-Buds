'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { flattenNavigation, type NavGroup } from './navigation';
import { isNavItemActive, type SidebarUser } from './sidebar';

/**
 * The narrow-screen shell. The sidebar is replaced by a sticky header that
 * names the current screen and a bottom bar of the five destinations this
 * role reaches most — a mentor filling in a weekly record on a phone should
 * never have to open a drawer to move between them.
 */

const BOTTOM_TAB_LIMIT = 5;

function currentLabel(groups: NavGroup[], pathname: string): string {
  const match = flattenNavigation(groups)
    .filter((item) => isNavItemActive(pathname, item.href))
    // `/panel/gruplar/x/y` matches both `/panel/gruplar` and itself; the
    // longest href is the most specific, so it is the one to name.
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? 'Panel';
}

export function MobileHeader({ groups, user }: { groups: NavGroup[]; user: SidebarUser }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
      <span className="grid size-[30px] flex-none place-items-center overflow-hidden rounded-[10px] border border-line bg-surface-2">
        <Image
          src="/brand/stem-buds-icon.png"
          alt=""
          width={16}
          height={21}
          className="h-[21px] w-4 object-contain"
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px]/[1.2] font-semibold text-ink">
          {currentLabel(groups, pathname)}
        </div>
        <div className="truncate text-[11px]/[1.3] font-medium text-ink-3">
          {user.roleLabel} · {user.scope}
        </div>
      </div>
      <span
        className={cn(
          'grid size-[30px] flex-none place-items-center rounded-[10px] text-[11px] font-bold',
          user.tintClass,
          user.inkClass,
        )}
      >
        {user.initials}
      </span>
    </header>
  );
}

export function MobileTabBar({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const tabs = flattenNavigation(groups).slice(0, BOTTOM_TAB_LIMIT);

  return (
    <nav
      aria-label="Alt menü"
      className="sticky bottom-0 z-10 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {tabs.map((item) => {
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex min-h-[54px] flex-1 flex-col items-center justify-center gap-1 px-1 text-center text-[10px]/[1.2] font-semibold transition-colors',
              active ? 'text-ink' : 'text-ink-3',
            )}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 top-0 h-[3px] rounded-b-full bg-accent"
              />
            ) : null}
            <span className="line-clamp-2 px-0.5">{item.label}</span>
            {item.badge ? (
              <span className="absolute right-1/4 top-2 h-4 min-w-4 rounded-full bg-surface-3 px-1 text-[9px]/4 font-bold text-ink-2">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
