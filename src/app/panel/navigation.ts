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

  // A student's whole relationship with the platform is one question —
  // "what is my group doing, and what do I owe?" — so it is one page, plus
  // the group's own chat. The survey only appears in the weeks it is open;
  // a permanent link to a form that is usually closed is a dead end.
  if (isStudent(scope.role)) {
    const items: NavItem[] = [
      { href: '/panel', label: 'Panelim' },
      { href: '/panel/mesajlar', label: 'Mesajlar', badge: badges.messages },
    ];
    if (badges.feedbackOpen) {
      items.push({ href: '/panel/geri-bildirim', label: 'Geri Bildirim' });
    }
    return [{ title: 'Günlük akış', items: items }];
  }

  // A mentor runs one group, and during the session hour class mode runs
  // them. What is left between sessions is small enough to name: the list
  // of what to do, the group itself, and the people to talk to.
  if (isMentor(scope.role)) {
    return [
      {
        title: 'Günlük akış',
        items: [
          { href: '/panel', label: 'Panelim' },
          { href: '/panel/mesajlar', label: 'Mesajlar', badge: badges.messages },
          { href: '/panel/bildirimler', label: 'Bildirimler', badge: badges.notifications },
        ],
      },
      {
        title: 'Program',
        items: [
          { href: '/panel/gruplar', label: 'Grubum' },
          { href: '/panel/toplantilar', label: 'Mentor Toplantıları' },
        ],
      },
    ];
  }

  // A chapter head reads the same alert pool as everyone else; it reaches
  // them once, on Panelim, rather than three times under three names.
  if (isChapterHead(scope.role)) {
    return [
      {
        title: 'Günlük akış',
        items: [
          { href: '/panel', label: 'Panelim' },
          { href: '/panel/mesajlar', label: 'Mesajlar', badge: badges.messages },
          { href: '/panel/bildirimler', label: 'Bildirimler', badge: badges.notifications },
        ],
      },
      {
        title: 'Program',
        items: [
          { href: '/panel/gruplar', label: 'Gruplar' },
          { href: '/panel/toplantilar', label: 'Mentor Toplantıları' },
        ],
      },
    ];
  }

  const daily: NavItem[] = [
    { href: '/panel', label: 'Panelim' },
    { href: '/panel/yapilacaklar', label: 'Yapılacaklar' },
    { href: '/panel/bildirimler', label: 'Bildirimler', badge: badges.notifications },
  ];

  if (!isAdvisorTeacher(scope.role)) {
    daily.push({ href: '/panel/mesajlar', label: 'Mesajlar', badge: badges.messages });
  }

  const program: NavItem[] = [
    { href: '/panel/gruplar', label: 'Gruplar' },
    { href: '/panel/projeler', label: 'Projeler' },
  ];

  if (isExecutive(scope.role)) {
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
  /** A student sees the survey link only while one is actually waiting. */
  feedbackOpen?: boolean;
};

/** Flattens the groups — used by the narrow layout's bottom tab bar. */
export function flattenNavigation(groups: NavGroup[]): NavItem[] {
  return groups.flatMap((group) => group.items);
}
