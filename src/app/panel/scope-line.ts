import 'server-only';
import { inArray } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapters, groups, programs } from '@/server/db/schema';
import { isAdvisorTeacher, isChapterHead, isExecutive, isMentor, isStudent, type AccessScope } from '@/server/authz/policy';

/**
 * The one-line "what can this account reach" summary shown under the user's
 * name in the shell — "3 grup · UAA", "UAA · Online Ortaokul".
 *
 * Deliberately derived from the same `AccessScope` the authorization rules
 * use, so the line can never claim reach the server would refuse.
 */
export async function describeScope(scope: AccessScope): Promise<string> {
  if (isExecutive(scope.role)) return 'Tüm platform · her iki program';

  const db = getDb();

  if (isAdvisorTeacher(scope.role)) {
    if (scope.advisorProgramIds.length === 0) return 'Henüz program atanmadı · salt okunur';
    const rows = await db
      .select({ shortName: programs.shortName })
      .from(programs)
      .where(inArray(programs.id, [...scope.advisorProgramIds]));
    const label = rows.length > 1 ? 'her iki program' : (rows[0]?.shortName ?? 'program');
    return `${label} · salt okunur`;
  }

  if (isChapterHead(scope.role)) {
    if (scope.headChapterIds.length === 0) return 'Henüz chapter atanmadı';
    const rows = await db
      .select({ code: chapters.code, programId: chapters.programId })
      .from(chapters)
      .where(inArray(chapters.id, [...scope.headChapterIds]));
    if (rows.length > 1) return `${rows.length} chapter`;
    const chapter = rows[0];
    if (!chapter) return 'Henüz chapter atanmadı';
    const [program] = await db
      .select({ shortName: programs.shortName })
      .from(programs)
      .where(inArray(programs.id, [chapter.programId]));
    return program ? `${chapter.code} · ${program.shortName}` : chapter.code;
  }

  if (isMentor(scope.role)) {
    if (scope.mentorGroupIds.length === 0) return 'Henüz grup atanmadı';
    const code = await firstChapterCode(scope.memberChapterIds);
    const count = `${scope.mentorGroupIds.length} grup`;
    return code ? `${count} · ${code}` : count;
  }

  if (isStudent(scope.role)) {
    if (scope.studentGroupIds.length === 0) return 'Henüz gruba eklenmedi';
    const rows = await db
      .select({ name: groups.name })
      .from(groups)
      .where(inArray(groups.id, [...scope.studentGroupIds]));
    const groupName = rows.length > 1 ? `${rows.length} grup` : (rows[0]?.name ?? 'Grup');
    const code = await firstChapterCode(scope.memberChapterIds);
    return code ? `${groupName} · ${code}` : groupName;
  }

  return '';
}

async function firstChapterCode(chapterIds: readonly string[]): Promise<string | null> {
  if (chapterIds.length === 0) return null;
  const [row] = await getDb()
    .select({ code: chapters.code })
    .from(chapters)
    .where(inArray(chapters.id, [...chapterIds]));
  return row?.code ?? null;
}
