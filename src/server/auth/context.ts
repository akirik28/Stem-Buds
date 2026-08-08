import { cache } from 'react';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapterMemberships, groupMemberships, groups } from '@/server/db/schema';
import { forbidden, unauthenticated } from '@/server/errors';
import type { AccessScope } from '@/server/authz/policy';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { sessionCookieName, validateSessionToken, type SessionUser } from './session';

export type AuthContext = {
  sessionId: string;
  user: SessionUser;
  scope: AccessScope;
  academicYearId: string | null;
};

/**
 * Loads the signed-in user together with every chapter and group they may
 * reach. Memoized per request so a page rendering several server components
 * runs the lookup once.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  const session = await validateSessionToken(token);
  if (!session) return null;

  const activeYear = await getActiveAcademicYear();
  const scope = await loadAccessScope(session.user.id, session.user.role, activeYear?.id ?? null);

  return {
    sessionId: session.sessionId,
    user: session.user,
    scope,
    academicYearId: activeYear?.id ?? null,
  };
});

export async function loadAccessScope(
  userId: string,
  role: SessionUser['role'],
  academicYearId: string | null,
): Promise<AccessScope> {
  const db = getDb();

  const chapterRows = academicYearId
    ? await db
        .select({ chapterId: chapterMemberships.chapterId, role: chapterMemberships.role })
        .from(chapterMemberships)
        .where(
          and(
            eq(chapterMemberships.userId, userId),
            eq(chapterMemberships.academicYearId, academicYearId),
            eq(chapterMemberships.isActive, true),
          ),
        )
    : [];

  const groupRows = academicYearId
    ? await db
        .select({
          groupId: groupMemberships.groupId,
          role: groupMemberships.role,
          isTeamLeader: groupMemberships.isTeamLeader,
        })
        .from(groupMemberships)
        .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
        .where(
          and(
            eq(groupMemberships.userId, userId),
            eq(groupMemberships.isActive, true),
            eq(groups.academicYearId, academicYearId),
          ),
        )
    : [];

  return {
    userId,
    role,
    headChapterIds: chapterRows.filter((r) => r.role === 'chapter_head').map((r) => r.chapterId),
    memberChapterIds: chapterRows.map((r) => r.chapterId),
    mentorGroupIds: groupRows.filter((r) => r.role === 'mentor').map((r) => r.groupId),
    studentGroupIds: groupRows.filter((r) => r.role === 'student').map((r) => r.groupId),
    teamLeaderGroupIds: groupRows
      .filter((r) => r.role === 'student' && r.isTeamLeader)
      .map((r) => r.groupId),
  };
}

/** Throws `unauthenticated` when nobody is signed in. */
export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw unauthenticated();
  return context;
}

/** Throws unless the predicate holds for the current user. */
export function assertPermission(allowed: boolean, message?: string): void {
  if (!allowed) throw forbidden(message);
}
