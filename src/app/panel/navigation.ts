import type { AccessScope } from '@/server/authz/policy';
import {
  canManageAccounts,
  canManageProgramSettings,
  canViewAuditLog,
  canViewManagementFeed,
  isAdvisorTeacher,
  isExecutive,
  isMentor,
  isStudent,
} from '@/server/authz/policy';

export type NavItem = {
  href: string;
  label: string;
};

/**
 * The navigation a given user may see.
 *
 * Hiding a link is a convenience, never the protection: every destination
 * re-checks authorization on the server.
 */
export function buildNavigation(scope: AccessScope): NavItem[] {
  const items: NavItem[] = [{ href: '/panel', label: 'Panelim' }];

  if (canViewManagementFeed(scope)) {
    items.push({ href: '/panel/yonetim-akisi', label: 'Yönetim Akışı' });
  }

  if (isMentor(scope.role)) {
    items.push({ href: '/panel/dikkat-gerektirenler', label: 'Dikkat Gerektirenler' });
  }

  if (isAdvisorTeacher(scope.role)) {
    items.push({ href: '/panel/grup-ozetleri', label: 'Grup Özetleri' });
  }

  if (!isStudent(scope.role)) {
    items.push({ href: '/panel/gruplar', label: 'Gruplar' });
  }

  if (isStudent(scope.role) || isMentor(scope.role)) {
    items.push({ href: '/panel/haftalik-calismalar', label: 'Haftalık Çalışmalar' });
  }

  items.push({ href: '/panel/projeler', label: 'Projeler' });

  if (!isStudent(scope.role) && !isAdvisorTeacher(scope.role)) {
    items.push({ href: '/panel/mesajlar', label: 'Mesajlar' });
  }

  if (canManageAccounts(scope)) {
    items.push({ href: '/panel/kullanicilar', label: 'Kullanıcılar' });
  }

  if (isExecutive(scope.role)) {
    items.push({ href: '/panel/site-icerikleri', label: 'Site İçerikleri' });
  }

  if (canManageProgramSettings(scope)) {
    items.push({ href: '/panel/ayarlar', label: 'Ayarlar' });
  }

  if (canViewAuditLog(scope)) {
    items.push({ href: '/panel/denetim-kaydi', label: 'Denetim Kaydı' });
  }

  return items;
}
