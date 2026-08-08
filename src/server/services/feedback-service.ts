import { and, avg, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { chapters, continuousFeedback, feedbackCycles, feedbackResponses, groupMemberships, groups, users, weeklySessions, weeklyWorkLogs } from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import { isChapterHead, isExecutive, isMentor, isStudent, type AccessScope } from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * Two independent Phase 6 concerns sharing this file because they share the
 * same "student voice" domain:
 *  - continuous, free-text feedback the student sends whenever they choose;
 *  - the structured "Son üç çalışmayı değerlendir" cycle the platform
 *    triggers automatically every 3 *completed* weekly sessions per Group
 *    (see `maybeGenerateFeedbackCycles`, called from
 *    `weekly-work-service.ts`'s `approveWeeklySession`).
 *
 * Raw `feedbackResponses` (including `chapterHeadNote`) are readable only by
 * Chapter Head / Executive Management — a Mentor only ever sees the
 * aggregated averages in `getMentorAggregateFeedback`, never individual text.
 */

export type ContinuousFeedback = typeof continuousFeedback.$inferSelect;
export type FeedbackCycle = typeof feedbackCycles.$inferSelect;
export type FeedbackResponse = typeof feedbackResponses.$inferSelect;

const CYCLE_INTERVAL = 3;

// ---------------------------------------------------------------------------
// Continuous feedback ("💬 Geri Bildirim Gönder")
// ---------------------------------------------------------------------------

export async function submitContinuousFeedback(input: {
  scope: AccessScope;
  category: ContinuousFeedback['category'];
  message: string;
  isAnonymous: boolean;
  groupId?: string | null;
  actor: { id: string | null; name: string };
}): Promise<ContinuousFeedback> {
  if (!isStudent(input.scope.role)) throw validationError('Yalnızca öğrenciler geri bildirim gönderebilir.');

  const chapterId = input.scope.memberChapterIds[0];
  if (!chapterId) throw validationError('Aktif bir chapter üyeliğiniz bulunmuyor.');

  const message = input.message.trim();
  if (message.length === 0) throw validationError('Geri bildirim boş olamaz.');

  let groupId: string | null = null;
  if (input.groupId) {
    if (!input.scope.studentGroupIds.includes(input.groupId)) {
      throw validationError('Yalnızca kendi grubunuz için geri bildirim gönderebilirsiniz.');
    }
    groupId = input.groupId;
  }

  const { getActiveAcademicYear } = await import('./academic-year');
  const activeYear = await getActiveAcademicYear();
  if (!activeYear) throw validationError('Aktif akademik yıl bulunamadı.');

  const [row] = await getDb()
    .insert(continuousFeedback)
    .values({
      chapterId,
      academicYearId: activeYear.id,
      groupId,
      category: input.category,
      message,
      isAnonymous: input.isAnonymous,
      reporterUserId: input.isAnonymous ? null : input.scope.userId,
    })
    .returning();
  if (!row) throw notFound('Geri bildirim oluşturulamadı.');

  await recordAudit({
    actorUserId: input.isAnonymous ? null : input.actor.id,
    actorName: input.isAnonymous ? 'Anonim' : input.actor.name,
    action: AUDIT_ACTIONS.continuousFeedbackSubmitted,
    targetType: 'continuous_feedback',
    targetId: row.id,
    chapterId,
    after: { category: row.category },
  });

  return row;
}

export type ContinuousFeedbackFilter = { programId?: string; onlyUnreviewed?: boolean };

/** Chapter Head (own chapter) / Executive (org-wide, Program-filterable) inbox. */
export async function listContinuousFeedbackForViewer(scope: AccessScope, filter: ContinuousFeedbackFilter = {}): Promise<ContinuousFeedback[]> {
  if (!isExecutive(scope.role) && !isChapterHead(scope.role)) return [];
  const db = getDb();
  const conditions: SQL[] = [];

  if (isChapterHead(scope.role)) {
    if (scope.headChapterIds.length === 0) return [];
    conditions.push(inArray(continuousFeedback.chapterId, [...scope.headChapterIds]));
  } else if (filter.programId) {
    const chapterRows = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.programId, filter.programId));
    conditions.push(inArray(continuousFeedback.chapterId, chapterRows.map((c) => c.id)));
  }
  if (filter.onlyUnreviewed) conditions.push(isNull(continuousFeedback.reviewedAt));

  return db
    .select()
    .from(continuousFeedback)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(continuousFeedback.createdAt))
    .limit(200);
}

export async function markFeedbackReviewed(input: {
  feedbackId: string;
  scope: AccessScope;
  actor: { id: string | null; name: string };
}): Promise<ContinuousFeedback> {
  if (!input.actor.id) throw validationError('Geçersiz kullanıcı.');
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(continuousFeedback).where(eq(continuousFeedback.id, input.feedbackId)).limit(1);
    if (!row) throw notFound('Geri bildirim bulunamadı.');
    const authorized = isExecutive(input.scope.role) || (isChapterHead(input.scope.role) && input.scope.headChapterIds.includes(row.chapterId));
    if (!authorized) throw validationError('Bu geri bildirimi görüntüleme yetkiniz yok.');

    const [updated] = await tx
      .update(continuousFeedback)
      .set({ reviewedAt: new Date(), reviewedById: input.actor.id })
      .where(eq(continuousFeedback.id, input.feedbackId))
      .returning();
    if (!updated) throw notFound('Geri bildirim bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.continuousFeedbackReviewed,
        targetType: 'continuous_feedback',
        targetId: updated.id,
        chapterId: updated.chapterId,
      },
      tx,
    );

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Periodic structured cycle ("Son üç çalışmayı değerlendir")
// ---------------------------------------------------------------------------

/**
 * Called from `approveWeeklySession` right after a session's work log
 * becomes complete. Counts the Group's total completed sessions; every time
 * that count crosses a multiple of 3, idempotently creates a pending cycle
 * for every currently active student membership in the Group.
 *
 * Idempotent by construction: `feedback_cycles_membership_threshold_unique`
 * makes a duplicate (membership, threshold) insert a safe no-op, so this can
 * be invoked on every session-completion transition without special-casing
 * "did we already do this."
 */
export async function maybeGenerateFeedbackCycles(groupId: string, db: Database): Promise<void> {
  const [group] = await db.select({ academicYearId: groups.academicYearId }).from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) return;

  const [countRow] = await db
    .select({ completedCount: sql<number>`count(*)::int` })
    .from(weeklySessions)
    .innerJoin(weeklyWorkLogs, eq(weeklyWorkLogs.weeklySessionId, weeklySessions.id))
    .where(and(eq(weeklySessions.groupId, groupId), isNotNull(weeklyWorkLogs.completedAt)));
  const completedCount = countRow?.completedCount ?? 0;
  if (completedCount === 0 || completedCount % CYCLE_INTERVAL !== 0) return;

  const memberships = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.role, 'student'), eq(groupMemberships.isActive, true)));
  if (memberships.length === 0) return;

  await db
    .insert(feedbackCycles)
    .values(
      memberships.map((m) => ({
        groupMembershipId: m.id,
        academicYearId: group.academicYearId,
        completedSessionThreshold: completedCount,
      })),
    )
    .onConflictDoNothing({ target: [feedbackCycles.groupMembershipId, feedbackCycles.completedSessionThreshold] });
}

/** The student's own oldest unanswered cycle, if any — drives the "Son üç çalışmayı değerlendir" prompt. */
export async function getPendingFeedbackCycleForStudent(scope: AccessScope): Promise<FeedbackCycle | null> {
  if (!isStudent(scope.role)) return null;
  const db = getDb();
  const memberships = await db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(and(inArray(groupMemberships.groupId, [...scope.studentGroupIds]), eq(groupMemberships.userId, scope.userId)));
  if (memberships.length === 0) return null;

  const [pending] = await db
    .select()
    .from(feedbackCycles)
    .where(and(inArray(feedbackCycles.groupMembershipId, memberships.map((m) => m.id)), isNull(feedbackCycles.respondedAt)))
    .orderBy(feedbackCycles.triggeredAt)
    .limit(1);
  return pending ?? null;
}

export type SubmitFeedbackResponseInput = {
  cycleId: string;
  ratingMentorGuidance: number;
  ratingSessionProductivity: number;
  ratingSupport: number;
  ratingGroupProgress: number;
  mostUseful?: string | null;
  wantChanged?: string | null;
  chapterHeadNote?: string | null;
  scope: AccessScope;
  actor: { id: string | null; name: string };
};

function assertValidRating(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw validationError(`${label} 1 ile 5 arasında bir tam sayı olmalıdır.`);
  }
}

export async function submitFeedbackResponse(input: SubmitFeedbackResponseInput): Promise<FeedbackResponse> {
  if (!isStudent(input.scope.role)) throw validationError('Yalnızca öğrenciler bu anketi doldurabilir.');
  assertValidRating(input.ratingMentorGuidance, 'Mentor yönlendirmesi puanı');
  assertValidRating(input.ratingSessionProductivity, 'Verimlilik puanı');
  assertValidRating(input.ratingSupport, 'Destek puanı');
  assertValidRating(input.ratingGroupProgress, 'İlerleme puanı');

  return getDb().transaction(async (tx) => {
    const [cycle] = await tx.select().from(feedbackCycles).where(eq(feedbackCycles.id, input.cycleId)).limit(1);
    if (!cycle) throw notFound('Anket bulunamadı.');
    if (cycle.respondedAt) throw validationError('Bu anket zaten yanıtlandı.');

    const [membership] = await tx.select().from(groupMemberships).where(eq(groupMemberships.id, cycle.groupMembershipId)).limit(1);
    if (!membership || membership.userId !== input.scope.userId) {
      throw validationError('Bu anketi yalnızca ilgili öğrenci yanıtlayabilir.');
    }

    const [response] = await tx
      .insert(feedbackResponses)
      .values({
        cycleId: cycle.id,
        ratingMentorGuidance: input.ratingMentorGuidance,
        ratingSessionProductivity: input.ratingSessionProductivity,
        ratingSupport: input.ratingSupport,
        ratingGroupProgress: input.ratingGroupProgress,
        mostUseful: input.mostUseful?.trim() || null,
        wantChanged: input.wantChanged?.trim() || null,
        chapterHeadNote: input.chapterHeadNote?.trim() || null,
      })
      .returning();
    if (!response) throw notFound('Yanıt kaydedilemedi.');

    await tx.update(feedbackCycles).set({ respondedAt: new Date() }).where(eq(feedbackCycles.id, cycle.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.feedbackCycleResponded,
        targetType: 'feedback_cycle',
        targetId: cycle.id,
      },
      tx,
    );

    return response;
  });
}

// ---------------------------------------------------------------------------
// Reading responses
// ---------------------------------------------------------------------------

export type FeedbackAverages = {
  responseCount: number;
  avgMentorGuidance: number | null;
  avgSessionProductivity: number | null;
  avgSupport: number | null;
  avgGroupProgress: number | null;
};

/**
 * A Mentor's own Group, averages only — never raw text, never
 * `chapterHeadNote`, never per-student attribution. This is the one Section
 * 6.4-adjacent boundary the schema's own doc comment calls out explicitly.
 */
export async function getMentorAggregateFeedback(scope: AccessScope, groupId: string): Promise<FeedbackAverages | null> {
  if (!isMentor(scope.role) || !scope.mentorGroupIds.includes(groupId)) return null;
  const db = getDb();

  const memberships = await db.select({ id: groupMemberships.id }).from(groupMemberships).where(eq(groupMemberships.groupId, groupId));
  if (memberships.length === 0) return { responseCount: 0, avgMentorGuidance: null, avgSessionProductivity: null, avgSupport: null, avgGroupProgress: null };

  const cycleIds = (
    await db.select({ id: feedbackCycles.id }).from(feedbackCycles).where(inArray(feedbackCycles.groupMembershipId, memberships.map((m) => m.id)))
  ).map((c) => c.id);
  if (cycleIds.length === 0) return { responseCount: 0, avgMentorGuidance: null, avgSessionProductivity: null, avgSupport: null, avgGroupProgress: null };

  const [row] = await db
    .select({
      responseCount: sql<number>`count(*)::int`,
      avgMentorGuidance: avg(feedbackResponses.ratingMentorGuidance),
      avgSessionProductivity: avg(feedbackResponses.ratingSessionProductivity),
      avgSupport: avg(feedbackResponses.ratingSupport),
      avgGroupProgress: avg(feedbackResponses.ratingGroupProgress),
    })
    .from(feedbackResponses)
    .where(inArray(feedbackResponses.cycleId, cycleIds));

  return {
    responseCount: row?.responseCount ?? 0,
    avgMentorGuidance: row?.avgMentorGuidance ? Number(row.avgMentorGuidance) : null,
    avgSessionProductivity: row?.avgSessionProductivity ? Number(row.avgSessionProductivity) : null,
    avgSupport: row?.avgSupport ? Number(row.avgSupport) : null,
    avgGroupProgress: row?.avgGroupProgress ? Number(row.avgGroupProgress) : null,
  };
}

export type RawFeedbackResponseRow = FeedbackResponse & { studentName: string; studentUsername: string; groupId: string };

/** Chapter Head / Executive only — raw, identified responses including `chapterHeadNote`. */
export async function listFeedbackResponsesForChapter(scope: AccessScope, chapterId: string): Promise<RawFeedbackResponseRow[]> {
  if (!isExecutive(scope.role) && !(isChapterHead(scope.role) && scope.headChapterIds.includes(chapterId))) {
    return [];
  }
  const db = getDb();
  const rows = await db
    .select({
      response: feedbackResponses,
      studentName: users.fullName,
      studentUsername: users.username,
      groupId: groupMemberships.groupId,
    })
    .from(feedbackResponses)
    .innerJoin(feedbackCycles, eq(feedbackCycles.id, feedbackResponses.cycleId))
    .innerJoin(groupMemberships, eq(groupMemberships.id, feedbackCycles.groupMembershipId))
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(eq(groups.chapterId, chapterId))
    .orderBy(desc(feedbackResponses.submittedAt))
    .limit(200);

  return rows.map((r) => ({ ...r.response, studentName: r.studentName, studentUsername: r.studentUsername, groupId: r.groupId }));
}
