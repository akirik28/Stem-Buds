import { and, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/server/db';
import {
  chapterMemberships,
  chapterSessionRuns,
  chapters,
  groups,
  users,
  weeklySessions,
  weeklyWorkLogs,
} from '@/server/db/schema';
import { validationError } from '@/server/errors';
import { isChapterHead, isExecutive, isMentor, type AccessScope } from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';
import { getOrCreateWorkLog } from './weekly-work-service';

/**
 * Ders modu — the platform during the hour the programme actually happens.
 *
 * Every group in a programme meets in the same weekly slot, so for that one
 * hour the panel has a single job and can stop offering everything else. The
 * window opens before the session so the chapter head can set the rooms up,
 * and stays open afterwards because attendance is easier to finish once the
 * students have gone.
 *
 * Nothing here schedules or decides: the sessions already exist, the
 * attendance and homework tables already exist. This only works out which
 * session is happening for the person looking, and records the two facts
 * that had nowhere to live — that the head split the rooms, and that
 * somebody could not come.
 */

/** Opens early enough to set up, without the panel changing shape all morning. */
export const OPENS_BEFORE_MINUTES = 15;

/** Stays open after the session so attendance can be finished calmly. */
export const CLOSES_AFTER_MINUTES = 60;

const MINUTE = 60 * 1000;

export type ClassModeSession = {
  sessionId: string;
  groupId: string;
  groupName: string;
  chapterId: string;
  chapterName: string;
  chapterMeetingUrl: string | null;
  academicYearId: string;
  weekNumber: number;
  startsAt: Date;
  endsAt: Date;
};

export type ChapterRun = typeof chapterSessionRuns.$inferSelect;

/** True while `now` sits inside a session's class-mode window. */
export function isWithinWindow(session: { scheduledStartAt: Date; scheduledEndAt: Date }, now: Date) {
  return (
    now.getTime() >= session.scheduledStartAt.getTime() - OPENS_BEFORE_MINUTES * MINUTE &&
    now.getTime() <= session.scheduledEndAt.getTime() + CLOSES_AFTER_MINUTES * MINUTE
  );
}

/**
 * The session class mode should show this person, or null when the panel
 * should behave normally. A mentor gets their own group's session; a chapter
 * head gets the first session running in a chapter they lead, which is
 * enough to name the week — every group in the chapter shares the slot.
 */
export async function getActiveSession(
  scope: AccessScope,
  now: Date = new Date(),
): Promise<ClassModeSession | null> {
  const groupIds = isMentor(scope.role) ? scope.mentorGroupIds : [];
  const chapterIds = isChapterHead(scope.role) ? scope.headChapterIds : [];
  const seesEverything = isExecutive(scope.role);
  if (!seesEverything && groupIds.length === 0 && chapterIds.length === 0) return null;

  const from = new Date(now.getTime() - CLOSES_AFTER_MINUTES * MINUTE);
  const to = new Date(now.getTime() + OPENS_BEFORE_MINUTES * MINUTE);

  const rows = await getDb()
    .select({
      session: weeklySessions,
      groupName: groups.name,
      chapterId: groups.chapterId,
      chapterName: chapters.name,
      chapterMeetingUrl: chapters.meetingUrl,
    })
    .from(weeklySessions)
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .innerJoin(chapters, eq(chapters.id, groups.chapterId))
    .where(
      and(
        eq(weeklySessions.state, 'scheduled'),
        lte(weeklySessions.scheduledStartAt, to),
        gte(weeklySessions.scheduledEndAt, from),
      ),
    );

  const mine = seesEverything
    ? rows
    : rows.filter(
        (row) =>
          (groupIds.length > 0 && groupIds.includes(row.session.groupId)) ||
          (chapterIds.length > 0 && chapterIds.includes(row.chapterId)),
      );
  const live = mine.find((row) => isWithinWindow(row.session, now));
  if (!live) return null;

  return {
    sessionId: live.session.id,
    groupId: live.session.groupId,
    groupName: live.groupName,
    chapterId: live.chapterId,
    chapterName: live.chapterName,
    chapterMeetingUrl: live.chapterMeetingUrl,
    academicYearId: live.session.academicYearId,
    weekNumber: live.session.weekNumber,
    startsAt: live.session.scheduledStartAt,
    endsAt: live.session.scheduledEndAt,
  };
}

/** Every group meeting in this chapter this week, with its mentor's name. */
export async function listChapterGroupsForWeek(chapterId: string, academicYearId: string, weekNumber: number) {
  return getDb()
    .select({
      groupId: groups.id,
      groupName: groups.name,
      sessionId: weeklySessions.id,
      mentorUserId: groups.mentorUserId,
      mentorAbsentAt: weeklyWorkLogs.mentorAbsentAt,
      attendanceFinalizedAt: weeklyWorkLogs.attendanceFinalizedAt,
    })
    .from(weeklySessions)
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .leftJoin(weeklyWorkLogs, eq(weeklyWorkLogs.weeklySessionId, weeklySessions.id))
    .where(
      and(
        eq(groups.chapterId, chapterId),
        eq(weeklySessions.academicYearId, academicYearId),
        eq(weeklySessions.weekNumber, weekNumber),
        eq(weeklySessions.state, 'scheduled'),
      ),
    )
    .orderBy(groups.name);
}

/** The chapter's row for this week, created on first touch. */
export async function getOrCreateChapterRun(
  chapterId: string,
  academicYearId: string,
  weekNumber: number,
): Promise<ChapterRun> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(chapterSessionRuns)
    .where(
      and(
        eq(chapterSessionRuns.chapterId, chapterId),
        eq(chapterSessionRuns.academicYearId, academicYearId),
        eq(chapterSessionRuns.weekNumber, weekNumber),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(chapterSessionRuns)
    .values({ chapterId, academicYearId, weekNumber })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost the race: the row another request inserted is the right one.
  const [row] = await db
    .select()
    .from(chapterSessionRuns)
    .where(
      and(
        eq(chapterSessionRuns.chapterId, chapterId),
        eq(chapterSessionRuns.academicYearId, academicYearId),
        eq(chapterSessionRuns.weekNumber, weekNumber),
      ),
    )
    .limit(1);
  if (!row) throw validationError('Hafta kaydı oluşturulamadı.');
  return row;
}

function assertHeadOf(scope: AccessScope, chapterId: string) {
  if (!isChapterHead(scope.role) || !scope.headChapterIds.includes(chapterId)) {
    throw validationError('Bu chapter sizde değil.');
  }
}

/** The head says the rooms are open; every mentor in the chapter is waiting on it. */
export async function markRoomsSplit(
  scope: AccessScope,
  input: { chapterId: string; academicYearId: string; weekNumber: number },
  actor: { id: string | null; name: string },
): Promise<ChapterRun> {
  assertHeadOf(scope, input.chapterId);
  const run = await getOrCreateChapterRun(input.chapterId, input.academicYearId, input.weekNumber);

  const [updated] = await getDb()
    .update(chapterSessionRuns)
    .set({ roomsSplitAt: new Date(), roomsSplitById: scope.userId, updatedAt: new Date() })
    .where(eq(chapterSessionRuns.id, run.id))
    .returning();
  if (!updated) throw validationError('Güncellenemedi.');

  await recordAudit({
    action: AUDIT_ACTIONS.classRoomsSplit,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'chapter_session_run',
    targetId: run.id,
    chapterId: input.chapterId,
    after: { weekNumber: input.weekNumber },
  });

  return updated;
}

/** The head cannot make it. Recorded as a plan, not inferred from silence. */
export async function markHeadAbsent(
  scope: AccessScope,
  input: { chapterId: string; academicYearId: string; weekNumber: number; note: string },
  actor: { id: string | null; name: string },
): Promise<ChapterRun> {
  assertHeadOf(scope, input.chapterId);
  const run = await getOrCreateChapterRun(input.chapterId, input.academicYearId, input.weekNumber);

  const [updated] = await getDb()
    .update(chapterSessionRuns)
    .set({ headAbsentAt: new Date(), headAbsentNote: input.note.trim() || null, updatedAt: new Date() })
    .where(eq(chapterSessionRuns.id, run.id))
    .returning();
  if (!updated) throw validationError('Güncellenemedi.');

  await recordAudit({
    action: AUDIT_ACTIONS.classHeadAbsent,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'chapter_session_run',
    targetId: run.id,
    chapterId: input.chapterId,
    after: { weekNumber: input.weekNumber },
  });

  return updated;
}

/** The mentor cannot run this week. Their chapter head is who needs to know. */
export async function markMentorAbsent(
  scope: AccessScope,
  input: { weeklySessionId: string; groupId: string; note: string },
  actor: { id: string | null; name: string },
): Promise<void> {
  if (!isMentor(scope.role) || !scope.mentorGroupIds.includes(input.groupId)) {
    throw validationError('Bu grup sizde değil.');
  }
  const db = getDb();
  await getOrCreateWorkLog(input.weeklySessionId, db);
  await db
    .update(weeklyWorkLogs)
    .set({ mentorAbsentAt: new Date(), mentorAbsentNote: input.note.trim() || null, updatedAt: new Date() })
    .where(eq(weeklyWorkLogs.weeklySessionId, input.weeklySessionId));

  await recordAudit({
    action: AUDIT_ACTIONS.classMentorAbsent,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'weekly_session',
    targetId: input.weeklySessionId,
    after: { groupId: input.groupId },
  });
}

/** The chapter's standing link, set once a year by its head. */
export async function setChapterMeetingUrl(
  scope: AccessScope,
  input: { chapterId: string; meetingUrl: string },
  actor: { id: string | null; name: string },
): Promise<void> {
  assertHeadOf(scope, input.chapterId);
  const url = input.meetingUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) {
    throw validationError('Bağlantı https:// ile başlamalı.');
  }
  if (url.length > 500) throw validationError('Bağlantı çok uzun.');

  await getDb()
    .update(chapters)
    .set({ meetingUrl: url || null, updatedAt: new Date() })
    .where(eq(chapters.id, input.chapterId));

  await recordAudit({
    action: AUDIT_ACTIONS.chapterMeetingUrlSet,
    actorUserId: actor.id,
    actorName: actor.name,
    targetType: 'chapter',
    targetId: input.chapterId,
    chapterId: input.chapterId,
  });
}

export type AbsenceNotice = {
  id: string;
  who: 'mentor' | 'chapter_head';
  title: string;
  detail: string;
  href: string | null;
};

/**
 * Who said they could not come this week, told to the person who has to do
 * something about it: a mentor's absence is their chapter head's problem, a
 * head's absence is management's.
 *
 * This reads only what someone chose to declare. A mentor who simply never
 * showed up is already covered by the missing-record alert, and conflating
 * the two would make "I told you in advance" worth nothing.
 */
export async function listAbsencesForViewer(
  scope: AccessScope,
  now: Date = new Date(),
): Promise<AbsenceNotice[]> {
  const db = getDb();
  const dayAgo = new Date(now.getTime() - 24 * 60 * MINUTE);

  if (isChapterHead(scope.role) && scope.headChapterIds.length > 0) {
    const rows = await db
      .select({
        sessionId: weeklySessions.id,
        groupId: groups.id,
        groupName: groups.name,
        chapterId: groups.chapterId,
        weekNumber: weeklySessions.weekNumber,
        note: weeklyWorkLogs.mentorAbsentNote,
      })
      .from(weeklyWorkLogs)
      .innerJoin(weeklySessions, eq(weeklySessions.id, weeklyWorkLogs.weeklySessionId))
      .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
      .where(and(gte(weeklyWorkLogs.mentorAbsentAt, dayAgo), lte(weeklySessions.scheduledStartAt, new Date(now.getTime() + 7 * 24 * 60 * MINUTE))));

    return rows
      .filter((row) => scope.headChapterIds.includes(row.chapterId))
      .map((row) => ({
        id: `mentor-absent:${row.sessionId}`,
        who: 'mentor' as const,
        title: `${row.groupName}: mentör bu hafta katılamıyor`,
        detail: row.note?.trim() || 'Sebep belirtilmedi. Gruba kimin bakacağını ayarla.',
        href: `/panel/gruplar/${row.chapterId}/${row.groupId}`,
      }));
  }

  // Vice presidents and above see the heads who stepped out.
  if (scope.role === 'vice_president' || scope.role === 'regional_director') {
    const rows = await db
      .select({
        runId: chapterSessionRuns.id,
        chapterName: chapters.name,
        weekNumber: chapterSessionRuns.weekNumber,
        note: chapterSessionRuns.headAbsentNote,
      })
      .from(chapterSessionRuns)
      .innerJoin(chapters, eq(chapters.id, chapterSessionRuns.chapterId))
      .where(gte(chapterSessionRuns.headAbsentAt, dayAgo));

    return rows.map((row) => ({
      id: `head-absent:${row.runId}`,
      who: 'chapter_head' as const,
      title: `${row.chapterName}: chapter sorumlusu bu hafta katılamıyor`,
      detail: row.note?.trim() || 'Sebep belirtilmedi. Odaları kimin açacağını ayarla.',
      href: '/panel/gruplar',
    }));
  }

  return [];
}

export type LiveChapter = {
  chapterId: string;
  chapterCode: string;
  chapterName: string;
  meetingUrl: string | null;
  headName: string | null;
  headAbsent: boolean;
  roomsSplit: boolean;
  groups: { groupName: string; mentorAbsent: boolean; attendanceDone: boolean }[];
};

/**
 * The whole organisation during the session hour, for the people who roam.
 *
 * Named after what an executive actually wants to know while walking
 * between rooms: which chapter is open, who is running it, and where nobody
 * has taken attendance yet. Heads are listed with their chapter because
 * "who is where" is the question this screen exists to answer.
 */
export async function listLiveChapters(
  scope: AccessScope,
  now: Date = new Date(),
): Promise<LiveChapter[]> {
  if (!isExecutive(scope.role)) return [];

  const session = await getActiveSession(scope, now);
  if (!session) return [];

  const db = getDb();
  const rows = await db
    .select({
      chapterId: chapters.id,
      chapterCode: chapters.code,
      chapterName: chapters.name,
      meetingUrl: chapters.meetingUrl,
      groupName: groups.name,
      mentorAbsentAt: weeklyWorkLogs.mentorAbsentAt,
      attendanceFinalizedAt: weeklyWorkLogs.attendanceFinalizedAt,
    })
    .from(weeklySessions)
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .innerJoin(chapters, eq(chapters.id, groups.chapterId))
    .leftJoin(weeklyWorkLogs, eq(weeklyWorkLogs.weeklySessionId, weeklySessions.id))
    .where(
      and(
        eq(weeklySessions.academicYearId, session.academicYearId),
        eq(weeklySessions.weekNumber, session.weekNumber),
        eq(weeklySessions.state, 'scheduled'),
      ),
    )
    .orderBy(chapters.code, groups.name);

  const runs = await db
    .select()
    .from(chapterSessionRuns)
    .where(
      and(
        eq(chapterSessionRuns.academicYearId, session.academicYearId),
        eq(chapterSessionRuns.weekNumber, session.weekNumber),
      ),
    );

  const heads = await db
    .select({ chapterId: chapterMemberships.chapterId, fullName: users.fullName })
    .from(chapterMemberships)
    .innerJoin(users, eq(users.id, chapterMemberships.userId))
    .where(
      and(
        eq(chapterMemberships.academicYearId, session.academicYearId),
        eq(users.role, 'chapter_head'),
      ),
    );

  const byChapter = new Map<string, LiveChapter>();
  for (const row of rows) {
    const existing = byChapter.get(row.chapterId);
    const entry: LiveChapter =
      existing ??
      {
        chapterId: row.chapterId,
        chapterCode: row.chapterCode,
        chapterName: row.chapterName,
        meetingUrl: row.meetingUrl,
        headName: heads.find((head) => head.chapterId === row.chapterId)?.fullName ?? null,
        headAbsent: runs.find((run) => run.chapterId === row.chapterId)?.headAbsentAt != null,
        roomsSplit: runs.find((run) => run.chapterId === row.chapterId)?.roomsSplitAt != null,
        groups: [],
      };
    entry.groups.push({
      groupName: row.groupName,
      mentorAbsent: row.mentorAbsentAt !== null,
      attendanceDone: row.attendanceFinalizedAt !== null,
    });
    byChapter.set(row.chapterId, entry);
  }

  return [...byChapter.values()];
}
