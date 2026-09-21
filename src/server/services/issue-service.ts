import { and, asc, eq, inArray, lt } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { groupIssues, groups } from '@/server/db/schema';
import { validationError } from '@/server/errors';
import {
  canViewGroup,
  isChapterHead,
  isMentor,
  isParent,
  isRegionalDirector,
  isVicePresident,
  type AccessScope,
} from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * Reported group problems and the chain they travel.
 *
 * The chain is Mentor → Chapter Head → Vice President → Executive, and it
 * exists so that a problem lands on exactly one desk at a time. Two things
 * move an issue up, and the difference between them is the whole design:
 *
 *   - a person at the current level says they could not resolve it, or
 *   - it has sat at one level untouched for `DAYS_PER_LEVEL`.
 *
 * Only the first ever reaches an Executive. Time escalates an issue as far
 * as the Vice President and then stops, so a routine problem that nobody got
 * round to cannot arrive at the top of the organization on a timer — someone
 * has to decide it is worth that. That is the "küçük problemler beni
 * bağlamıyor" rule, expressed as a mechanism rather than a category list:
 * the platform never has to guess which problems are small.
 */

export const LEVELS = ['mentor', 'chapter_head', 'vice_president', 'executive'] as const;
export type IssueLevel = (typeof LEVELS)[number];

/** How long an issue may sit at one level before time moves it on. */
export const DAYS_PER_LEVEL = 7;

/** Time stops here. Past this, only a person can hand an issue upward. */
export const AUTO_ESCALATION_CEILING: IssueLevel = 'vice_president';

export type GroupIssue = typeof groupIssues.$inferSelect;

export const issueLevelLabels: Record<IssueLevel, string> = {
  mentor: 'Mentor',
  chapter_head: 'Chapter Sorumlusu',
  vice_president: 'Başkan Yardımcısı',
  executive: 'Yönetim',
};

function nextLevel(level: IssueLevel): IssueLevel | null {
  const index = LEVELS.indexOf(level);
  return index >= 0 && index < LEVELS.length - 1 ? (LEVELS[index + 1] as IssueLevel) : null;
}

/** The level a given role is responsible for. */
function levelForRole(scope: AccessScope): IssueLevel | null {
  if (isMentor(scope.role)) return 'mentor';
  if (isChapterHead(scope.role)) return 'chapter_head';
  if (isVicePresident(scope.role)) return 'vice_president';
  if (isRegionalDirector(scope.role)) return 'executive';
  return null;
}

/**
 * Reports a problem about a group. Starts at the Mentor, always — the person
 * closest to the group gets the first look regardless of who reported it.
 */
export async function reportIssue(
  scope: AccessScope,
  input: { groupId: string; body: string },
  actor: { id: string | null; name: string },
): Promise<GroupIssue> {
  const body = input.body.trim();
  if (body.length < 10) throw validationError('Lütfen sorunu birkaç cümleyle anlatın.');
  if (body.length > 4000) throw validationError('Açıklama çok uzun.');

  const [group] = await getDb()
    .select({ id: groups.id, chapterId: groups.chapterId })
    .from(groups)
    .where(eq(groups.id, input.groupId))
    .limit(1);
  if (!group) throw validationError('Grup bulunamadı.');

  // Whoever can open the group's page may report a problem about it, with the
  // single exception of a Veli — the chain is internal, and a parent's route
  // is their mentor, not this. `canViewGroup` is what proves the reporter is
  // actually attached to this group: the form passes a groupId, and a server
  // action can be called with any groupId at all.
  if (isParent(scope.role) || !canViewGroup(scope, group.id, group.chapterId)) {
    throw validationError('Bu işlem için yetkiniz yok.');
  }

  const [created] = await getDb()
    .insert(groupIssues)
    .values({ groupId: group.id, chapterId: group.chapterId, reportedById: scope.userId, body })
    .returning();
  if (!created) throw validationError('Sorun kaydedilemedi.');

  await recordAudit({
    action: AUDIT_ACTIONS.issueReported,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'group_issue',
    targetId: created.id,
    chapterId: group.chapterId,
    after: { groupId: group.id, level: created.level },
  });

  return created;
}

/**
 * Hands an issue to the next level because this one could not resolve it.
 *
 * Only the level currently holding the issue may pass it on — otherwise an
 * Executive could push their own work back down, or a Mentor could skip the
 * Chapter Head entirely.
 */
export async function escalateIssue(
  scope: AccessScope,
  issueId: string,
  actor: { id: string | null; name: string },
): Promise<GroupIssue> {
  const db = getDb();
  const [issue] = await db.select().from(groupIssues).where(eq(groupIssues.id, issueId)).limit(1);
  if (!issue) throw validationError('Kayıt bulunamadı.');
  if (issue.status !== 'open') throw validationError('Bu sorun zaten kapatılmış.');

  if (levelForRole(scope) !== issue.level) {
    throw validationError('Bu sorun şu anda sizde değil.');
  }

  const target = nextLevel(issue.level);
  if (!target) throw validationError('Bu sorun zaten en üst seviyede.');

  const [updated] = await db
    .update(groupIssues)
    .set({ level: target, levelSince: new Date() })
    .where(eq(groupIssues.id, issueId))
    .returning();
  if (!updated) throw validationError('Güncellenemedi.');

  await recordAudit({
    action: AUDIT_ACTIONS.issueEscalated,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'group_issue',
    targetId: issueId,
    chapterId: issue.chapterId,
    before: { level: issue.level },
    after: { level: target, by: 'person' },
  });

  return updated;
}

/** Closes an issue. Whoever currently holds it may close it. */
export async function resolveIssue(
  scope: AccessScope,
  issueId: string,
  note: string,
  actor: { id: string | null; name: string },
): Promise<GroupIssue> {
  const db = getDb();
  const [issue] = await db.select().from(groupIssues).where(eq(groupIssues.id, issueId)).limit(1);
  if (!issue) throw validationError('Kayıt bulunamadı.');
  if (issue.status !== 'open') throw validationError('Bu sorun zaten kapatılmış.');
  if (levelForRole(scope) !== issue.level) throw validationError('Bu sorun şu anda sizde değil.');

  const [updated] = await db
    .update(groupIssues)
    .set({ status: 'resolved', resolvedAt: new Date(), resolutionNote: note.trim() || null })
    .where(eq(groupIssues.id, issueId))
    .returning();
  if (!updated) throw validationError('Güncellenemedi.');

  await recordAudit({
    action: AUDIT_ACTIONS.issueResolved,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'group_issue',
    targetId: issueId,
    chapterId: issue.chapterId,
    after: { level: issue.level },
  });

  return updated;
}

/**
 * The open issues currently sitting with this viewer — their level, and only
 * the groups/chapters they are already allowed to see.
 */
export async function listIssuesForViewer(scope: AccessScope): Promise<GroupIssue[]> {
  const level = levelForRole(scope);
  if (!level) return [];

  const db = getDb();
  const conditions = [eq(groupIssues.status, 'open'), eq(groupIssues.level, level)];

  if (level === 'mentor') {
    if (scope.mentorGroupIds.length === 0) return [];
    conditions.push(inArray(groupIssues.groupId, [...scope.mentorGroupIds]));
  } else if (level === 'chapter_head') {
    if (scope.headChapterIds.length === 0) return [];
    conditions.push(inArray(groupIssues.chapterId, [...scope.headChapterIds]));
  }
  // Vice President and Executive see their level across the organization.

  return db
    .select()
    .from(groupIssues)
    .where(and(...conditions))
    .orderBy(asc(groupIssues.levelSince));
}

/**
 * Moves every issue that has sat too long at one level, up one level — but
 * never into `executive`. Run from the nightly job; idempotent, because the
 * clock it reads is reset by the move it makes.
 */
export async function escalateStaleIssues(now: Date = new Date()): Promise<{ escalated: number }> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - DAYS_PER_LEVEL * 24 * 60 * 60 * 1000);

  // Every level below the ceiling — the ceiling itself is left alone, which
  // is what keeps a timer from delivering routine work to an Executive.
  const movable = LEVELS.slice(0, LEVELS.indexOf(AUTO_ESCALATION_CEILING)) as IssueLevel[];
  if (movable.length === 0) return { escalated: 0 };

  const due = await db
    .select()
    .from(groupIssues)
    .where(
      and(
        eq(groupIssues.status, 'open'),
        inArray(groupIssues.level, movable),
        lt(groupIssues.levelSince, cutoff),
      ),
    );

  let escalated = 0;
  for (const issue of due) {
    const target = nextLevel(issue.level as IssueLevel);
    if (!target) continue;
    await db
      .update(groupIssues)
      .set({ level: target, levelSince: now })
      .where(and(eq(groupIssues.id, issue.id), eq(groupIssues.status, 'open')));
    await recordAudit({
      action: AUDIT_ACTIONS.issueEscalated,
      actorUserId: null,
      actorName: 'system',
      targetType: 'group_issue',
      targetId: issue.id,
      chapterId: issue.chapterId,
      before: { level: issue.level },
      after: { level: target, by: 'timer', daysPerLevel: DAYS_PER_LEVEL },
    });
    escalated += 1;
  }

  return { escalated };
}

/** How many days an issue has been sitting where it is. */
export function daysAtLevel(issue: GroupIssue, now: Date = new Date()): number {
  return Math.floor((now.getTime() - issue.levelSince.getTime()) / (24 * 60 * 60 * 1000));
}
