import type { UserRole } from '@/server/authz/policy';

/**
 * The tint each role carries in the interface — avatar chip, role line,
 * scope badges.
 *
 * Roles are grouped by what they can do rather than given six unrelated
 * colours: management is the `ai` violet, oversight roles (Chapter Head,
 * Danışman Öğretmen) share `info`, a Mentor is `ok`, a student is `warn`.
 * The colour is never the only signal — the role name is always written
 * next to it.
 */
export type RoleTheme = {
  /** Background of the avatar chip. */
  tint: string;
  /** Foreground for the chip's initials and the role line. */
  ink: string;
};

const ROLE_THEMES: Record<UserRole, RoleTheme> = {
  regional_director: { tint: 'bg-ai-soft', ink: 'text-ai' },
  vice_president: { tint: 'bg-ai-soft', ink: 'text-ai' },
  chapter_head: { tint: 'bg-info-soft', ink: 'text-info' },
  mentor: { tint: 'bg-ok-soft', ink: 'text-ok' },
  student: { tint: 'bg-warn-soft', ink: 'text-warn' },
  advisor_teacher: { tint: 'bg-info-soft', ink: 'text-info' },
  parent: { tint: 'bg-ai-soft', ink: 'text-ai' },
};

export function roleTheme(role: UserRole): RoleTheme {
  return ROLE_THEMES[role];
}

/**
 * Up to two initials from a full name. Turkish names routinely carry more
 * than two words ("Ada Sarp Kırık"), so this takes the first and last rather
 * than the first two — the last name is the more identifying half.
 */
export function initials(fullName: string): string {
  const parts = fullName
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toLocaleUpperCase('tr-TR');
  const first = parts[0]!.charAt(0);
  const last = parts[parts.length - 1]!.charAt(0);
  return (first + last).toLocaleUpperCase('tr-TR');
}
