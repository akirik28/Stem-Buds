'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from './navigation';

/**
 * Horizontal navigation that scrolls sideways on small screens instead of
 * wrapping into an unusable stack.
 */
export function PlatformNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Platform menüsü" className="border-t border-navy-100 bg-white">
      <div className="container-page">
        <ul className="-mx-1 flex gap-1 overflow-x-auto py-1">
          {items.map((item) => {
            const isActive =
              item.href === '/panel' ? pathname === '/panel' : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-navy-50 text-navy-900'
                      : 'text-navy-600 hover:bg-navy-50 hover:text-navy-900',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
