import type { AccessScope } from '@/server/authz/policy';
import {
  canManageAccounts,
  canManageProgramSettings,
  canViewAuditLog,
  canViewManagementFeed,
  isAdvisorTeacher,
  isChapterHead,
  isExecutive,
  isMentor,
  isParent,
  isStudent,
} from '@/server/authz/policy';

export type NavItem = {
  href: string;
  label: string;
  /** Unread/open count rendered as a pill on the right of the item. */
  badge?: number;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/**
 * The navigation a given user may see, in the three groups the interface is
 * organized around.
 *
 * Grouping is what lets one shell serve both a Regional Director with
 * fourteen destinations and a student with five without looking gap-toothed:
 * an empty group is dropped entirely rather than rendered as a bare heading.
 *
 * Hiding a link is a convenience, never the protection: every destination
 * re-checks authorization on the server.
 */
export function buildNavigation(scope: AccessScope, badges: NavBadges = {}): NavGroup[] {
  // A parent's shell is a different product, not a subset of the staff one:
  // the destinations are about one child, so they are grouped by that child
  // rather than by the program's working rhythm.
  if (isParent(scope.role)) {
    return [
      {
        title: 'Çocuğum',
        items: [
          { href: '/panel', label: 'Panelim' },
          { href: '/panel/cocugum/gelisim', label: 'Gelişim' },
          { href: '/panel/cocugum/grup', label: 'Grubu' },
        ],
      },
      {
        title: 'Program',
        items: [
          { href: '/panel/bildirimler', label: 'Bildirimler', badge: badges.notifications },
          { href: '/panel/cocugum/iletisim', label: 'Yönetimle iletişim' },
        ],
      },
    ];
  }

  const daily: NavItem[] = [
    { href: '/panel', label: 'Panelim' },
    { href: '/panel/yapilacaklar', label: 'Yapılacaklar' },
    { href: '/panel/bildirimler', label: 'Bildirimler', badge: badges.notifications },
  ];

  if (isMentor(scope.role)) {
    daily.push({
      href: '/panel/dikkat-gerektirenler',
      label: 'Dikkat Gerektirenler',
      badge: badges.attention,
    });
  }

  if (isStudent(scope.role) || isMentor(scope.role)) {
    daily.push({ href: '/panel/haftalik-calismalar', label: 'Haftalık Çalışmalar' });
  }

  if (isStudent(scope.role)) {
    daily.push({ href: '/panel/geri-bildirim', label: 'Geri Bildirim' });
  }

  if (!isStudent(scope.role) && !isAdvisorTeacher(scope.role)) {
    daily.push({ href: '/panel/mesajlar', label: 'Mesajlar', badge: badges.messages });
  }

  const program: NavItem[] = [];

  if (!isStudent(scope.role)) {
    program.push({ href: '/panel/gruplar', label: 'Gruplar' });
  }

  program.push({ href: '/panel/projeler', label: 'Projeler' });

  if (isChapterHead(scope.role) || isMentor(scope.role) || isExecutive(scope.role)) {
    program.push({ href: '/panel/toplantilar', label: 'Mentor Toplantıları' });
  }

  if (isAdvisorTeacher(scope.role)) {
    program.push({ href: '/panel/grup-ozetleri', label: 'Grup Özetleri' });
  }

  const management: NavItem[] = [];

  if (canViewManagementFeed(scope)) {
    management.push({ href: '/panel/yonetim-akisi', label: 'Yönetim Akışı', badge: badges.alerts });
  }

  // The visual handoff also lists this for Chapter Head, but account
  // management is Executive-only on the server (`canManageAccounts`). Showing
  // a link that the destination would refuse is worse than not showing it, so
  // the server rule wins until the policy itself is widened.
  if (canManageAccounts(scope)) {
    management.push({ href: '/panel/kullanicilar', label: 'Kullanıcılar' });
  }

  if (isExecutive(scope.role)) {
    management.push({ href: '/panel/site-icerikleri', label: 'Site İçerikleri' });
  }

  if (canManageProgramSettings(scope)) {
    management.push({ href: '/panel/ayarlar', label: 'Ayarlar' });
  }

  if (canViewAuditLog(scope)) {
    management.push({ href: '/panel/denetim-kaydi', label: 'Denetim Kaydı' });
  }

  return [
    { title: 'Günlük akış', items: daily },
    { title: 'Program', items: program },
    { title: 'Yönetim', items: management },
  ].filter((group) => group.items.length > 0);
}

export type NavBadges = {
  notifications?: number;
  messages?: number;
  alerts?: number;
  attention?: number;
};

/** Flattens the groups — used by the narrow layout's bottom tab bar. */
export function flattenNavigation(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}
