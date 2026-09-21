import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db';
import {
  attendanceRecords,
  chapterMemberships,
  chapters,
  notifications,
  groupMemberships,
  groups,
  homeworkAssignments,
  homeworkStudentStatuses,
  milestones,
  parentStudentLinks,
  programSettings,
  projects,
  users,
  weeklySessions,
} from '@/server/db/schema';
import { forbidden, validationError } from '@/server/errors';
import { AUDIT_ACTIONS, recordAudit } from './audit';
import { isParent, type AccessScope } from '@/server/authz/policy';

/**
 * Everything a Veli (parent) account is allowed to see.
 *
 * The boundary this module exists to hold: a parent is entitled to their own
 * child's records and to the *shape* of the group that child works in — the
 * mentor, the weekly slot, the project, how many students there are. They are
 * never given the other students' names, because those are other people's
 * children. Every query below is written to make that impossible rather than
 * relying on the page not to render it.
 */

export type ChildAttendance = {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Sessions with a finalized record, i.e. the denominator. */
  recorded: number;
  /** Null until at least one session has been recorded. */
  rate: number | null;
};

export type ChildHomework = { done: number; notDone: number; excused: number; pending: number };

export type ChildOverview = {
  studentUserId: string;
  studentName: string;
  groupId: string | null;
  groupName: string | null;
  chapterId: string | null;
  chapterName: string | null;
  mentorName: string | null;
  /** Deliberately a count, never a roster. */
  groupStudentCount: number;
  weeklySlot: { dayOfWeek: number; startMinute: number; durationMinutes: number } | null;
  attendance: ChildAttendance;
  homework: ChildHomework;
  project: { id: string; name: string; health: 'on_track' | 'attention' | 'delayed' } | null;
  milestones: { total: number; completed: number };
  nextSessionAt: Date | null;
};

function assertParentOf(scope: AccessScope, studentUserId: string): void {
  if (!isParent(scope.role) || !scope.parentStudentUserIds.includes(studentUserId)) {
    throw forbidden('Bu öğrencinin bilgilerine erişim yetkiniz yok.');
  }
}

/** The children this parent account follows, with the digest preference. */
export async function listChildren(
  scope: AccessScope,
): Promise<Array<{ studentUserId: string; fullName: string; monthlyDigestEnabled: boolean }>> {
  if (!isParent(scope.role) || scope.parentStudentUserIds.length === 0) return [];
  const rows = await getDb()
    .select({
      studentUserId: parentStudentLinks.studentUserId,
      fullName: users.fullName,
      monthlyDigestEnabled: parentStudentLinks.monthlyDigestEnabled,
    })
    .from(parentStudentLinks)
    .innerJoin(users, eq(users.id, parentStudentLinks.studentUserId))
    .where(eq(parentStudentLinks.parentUserId, scope.userId))
    .orderBy(users.fullName);
  return rows;
}

export async function getChildOverview(
  scope: AccessScope,
  studentUserId: string,
): Promise<ChildOverview> {
  assertParentOf(scope, studentUserId);
  const db = getDb();

  const [student] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, studentUserId))
    .limit(1);

  const base: ChildOverview = {
    studentUserId,
    studentName: student?.fullName ?? '',
    groupId: null,
    groupName: null,
    chapterId: null,
    chapterName: null,
    mentorName: null,
    groupStudentCount: 0,
    weeklySlot: null,
    attendance: { present: 0, late: 0, absent: 0, excused: 0, recorded: 0, rate: null },
    homework: { done: 0, notDone: 0, excused: 0, pending: 0 },
    project: null,
    milestones: { total: 0, completed: 0 },
    nextSessionAt: null,
  };

  const [membership] = await db
    .select({
      membershipId: groupMemberships.id,
      groupId: groups.id,
      groupName: groups.name,
      academicYearId: groups.academicYearId,
      programId: groups.programId,
      chapterId: chapters.id,
      chapterName: chapters.name,
      mentorUserId: groups.mentorUserId,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .innerJoin(chapters, eq(chapters.id, groups.chapterId))
    .where(
      and(
        eq(groupMemberships.userId, studentUserId),
        eq(groupMemberships.role, 'student'),
        eq(groupMemberships.isActive, true),
      ),
    )
    .limit(1);

  if (!membership) return base;

  const [mentor] = membership.mentorUserId
    ? await db
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, membership.mentorUserId))
        .limit(1)
    : [];

  // A count, never the rows: the roster is not this viewer's to see.
  const [studentCountRow] = await db
    .select({ value: count() })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.groupId, membership.groupId),
        eq(groupMemberships.role, 'student'),
        eq(groupMemberships.isActive, true),
      ),
    );

  const [settings] = await db
    .select({
      weeklyDayOfWeek: programSettings.weeklyDayOfWeek,
      weeklyStartMinute: programSettings.weeklyStartMinute,
      weeklyDurationMinutes: programSettings.weeklyDurationMinutes,
    })
    .from(programSettings)
    .where(eq(programSettings.programId, membership.programId))
    .limit(1);

  const attendanceRows = await db
    .select({ status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.groupMembershipId, membership.membershipId));

  const attendance: ChildAttendance = {
    present: attendanceRows.filter((r) => r.status === 'present').length,
    late: attendanceRows.filter((r) => r.status === 'late').length,
    absent: attendanceRows.filter((r) => r.status === 'absent').length,
    excused: attendanceRows.filter((r) => r.status === 'excused').length,
    recorded: attendanceRows.length,
    rate: null,
  };
  if (attendance.recorded > 0) {
    // An excused absence is not counted against the child — it is removed
    // from the denominator rather than scored as a miss.
    const counted = attendance.recorded - attendance.excused;
    attendance.rate = counted > 0 ? (attendance.present + attendance.late) / counted : null;
  }

  const homeworkRows = await db
    .select({ status: homeworkStudentStatuses.status })
    .from(homeworkStudentStatuses)
    .where(eq(homeworkStudentStatuses.groupMembershipId, membership.membershipId));

  const homework: ChildHomework = {
    done: homeworkRows.filter((r) => r.status === 'done').length,
    notDone: homeworkRows.filter((r) => r.status === 'not_done').length,
    excused: homeworkRows.filter((r) => r.status === 'excused').length,
    pending: homeworkRows.filter((r) => r.status === 'pending').length,
  };

  const [project] = await db
    .select({ id: projects.id, name: projects.name, health: projects.health })
    .from(projects)
    .where(
      and(
        eq(projects.groupId, membership.groupId),
        eq(projects.academicYearId, membership.academicYearId),
      ),
    )
    .limit(1);

  let milestoneSummary = { total: 0, completed: 0 };
  if (project) {
    const rows = await db
      .select({ status: milestones.status })
      .from(milestones)
      .where(eq(milestones.projectId, project.id));
    milestoneSummary = {
      total: rows.length,
      completed: rows.filter((r) => r.status === 'completed').length,
    };
  }

  const [nextSession] = await db
    .select({ scheduledStartAt: weeklySessions.scheduledStartAt })
    .from(weeklySessions)
    .where(and(eq(weeklySessions.groupId, membership.groupId), eq(weeklySessions.state, 'scheduled')))
    .orderBy(weeklySessions.scheduledStartAt)
    .limit(1);

  return {
    ...base,
    groupId: membership.groupId,
    groupName: membership.groupName,
    chapterId: membership.chapterId,
    chapterName: membership.chapterName,
    mentorName: mentor?.fullName ?? null,
    groupStudentCount: studentCountRow?.value ?? 0,
    weeklySlot:
      settings?.weeklyDayOfWeek !== null &&
      settings?.weeklyDayOfWeek !== undefined &&
      settings.weeklyStartMinute !== null &&
      settings.weeklyDurationMinutes !== null
        ? {
            dayOfWeek: settings.weeklyDayOfWeek,
            startMinute: settings.weeklyStartMinute,
            durationMinutes: settings.weeklyDurationMinutes,
          }
        : null,
    attendance,
    homework,
    project: project ?? null,
    milestones: milestoneSummary,
    nextSessionAt: nextSession?.scheduledStartAt ?? null,
  };
}

/**
 * The child's own week-by-week history — attendance and homework result per
 * session. Nothing about any other student appears in the result.
 */
export type ChildWeek = {
  weekNumber: number;
  scheduledStartAt: Date;
  attendance: 'present' | 'late' | 'absent' | 'excused' | null;
  attendanceNote: string | null;
  homework: 'pending' | 'done' | 'not_done' | 'excused' | null;
  homeworkDescription: string | null;
};

export async function listChildWeeks(
  scope: AccessScope,
  studentUserId: string,
  limit = 16,
): Promise<ChildWeek[]> {
  assertParentOf(scope, studentUserId);
  const db = getDb();

  const [membership] = await db
    .select({ membershipId: groupMemberships.id, groupId: groupMemberships.groupId })
    .from(groupMemberships)
    .where(
      and(
        eq(groupMemberships.userId, studentUserId),
        eq(groupMemberships.role, 'student'),
        eq(groupMemberships.isActive, true),
      ),
    )
    .limit(1);
  if (!membership) return [];

  const sessions = await db
    .select({
      id: weeklySessions.id,
      weekNumber: weeklySessions.weekNumber,
      scheduledStartAt: weeklySessions.scheduledStartAt,
    })
    .from(weeklySessions)
    .where(eq(weeklySessions.groupId, membership.groupId))
    .orderBy(desc(weeklySessions.scheduledStartAt))
    .limit(limit);
  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);

  const attendance = await db
    .select({
      weeklySessionId: attendanceRecords.weeklySessionId,
      status: attendanceRecords.status,
      note: attendanceRecords.note,
    })
    .from(attendanceRecords)
    .where(
      and(
        inArray(attendanceRecords.weeklySessionId, sessionIds),
        eq(attendanceRecords.groupMembershipId, membership.membershipId),
      ),
    );
  const attendanceBySession = new Map(attendance.map((a) => [a.weeklySessionId, a]));

  const assignments = await db
    .select({
      id: homeworkAssignments.id,
      weeklySessionId: homeworkAssignments.weeklySessionId,
      description: homeworkAssignments.description,
    })
    .from(homeworkAssignments)
    .where(inArray(homeworkAssignments.weeklySessionId, sessionIds));
  const assignmentBySession = new Map(assignments.map((a) => [a.weeklySessionId, a]));

  const statuses = assignments.length
    ? await db
        .select({
          assignmentId: homeworkStudentStatuses.assignmentId,
          status: homeworkStudentStatuses.status,
        })
        .from(homeworkStudentStatuses)
        .where(
          and(
            inArray(
              homeworkStudentStatuses.assignmentId,
              assignments.map((a) => a.id),
            ),
            eq(homeworkStudentStatuses.groupMembershipId, membership.membershipId),
          ),
        )
    : [];
  const statusByAssignment = new Map(statuses.map((s) => [s.assignmentId, s.status]));

  return sessions.map((session) => {
    const assignment = assignmentBySession.get(session.id);
    return {
      weekNumber: session.weekNumber,
      scheduledStartAt: session.scheduledStartAt,
      attendance: attendanceBySession.get(session.id)?.status ?? null,
      attendanceNote: attendanceBySession.get(session.id)?.note ?? null,
      homework: assignment ? (statusByAssignment.get(assignment.id) ?? null) : null,
      homeworkDescription: assignment?.description ?? null,
    };
  });
}

/** Turns the monthly summary e-mail on or off for one child. */
export async function setMonthlyDigest(
  scope: AccessScope,
  studentUserId: string,
  enabled: boolean,
): Promise<void> {
  assertParentOf(scope, studentUserId);
  await getDb()
    .update(parentStudentLinks)
    .set({ monthlyDigestEnabled: enabled })
    .where(
      and(
        eq(parentStudentLinks.parentUserId, scope.userId),
        eq(parentStudentLinks.studentUserId, studentUserId),
      ),
    );
}

// ---------------------------------------------------------------------------
// Parent → programme management
// ---------------------------------------------------------------------------

export type ParentMessageKind = 'question' | 'excuse';

const KIND_LABEL: Record<ParentMessageKind, string> = {
  question: 'Veliden soru',
  excuse: 'Veliden mazeret bildirimi',
};

/**
 * A parent's one channel into the programme.
 *
 * It reaches the **Vice President and the chapter's head**, never the mentor.
 * Mentors are high-school students running a group; fielding parent
 * correspondence is not their job and would put them between a parent and the
 * programme. Management owns that conversation.
 *
 * It is also not the group's message channel — `canAccessChannel` blocks a
 * parent from that unconditionally, because that space belongs to the
 * students. This raises a notification for people who are accountable,
 * without opening a room a parent should not be in.
 */
export async function sendParentMessage(
  scope: AccessScope,
  input: { studentUserId: string; kind: ParentMessageKind; body: string },
): Promise<void> {
  assertParentOf(scope, input.studentUserId);

  const body = input.body.trim();
  if (body.length === 0) throw validationError('Mesaj boş olamaz.');
  if (body.length > 2000) throw validationError('Mesaj çok uzun.');

  const db = getDb();

  const [membership] = await db
    .select({
      groupId: groups.id,
      chapterId: groups.chapterId,
      academicYearId: groups.academicYearId,
    })
    .from(groupMemberships)
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(
      and(
        eq(groupMemberships.userId, input.studentUserId),
        eq(groupMemberships.role, 'student'),
        eq(groupMemberships.isActive, true),
      ),
    )
    .limit(1);
  if (!membership) throw validationError('Çocuğunuz henüz bir gruba eklenmedi.');

  const [child] = await db
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, input.studentUserId))
    .limit(1);

  const recipientIds = new Set<string>();

  // Vice President: the role that owns parent correspondence programme-wide.
  const vicePresidents = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'vice_president'), eq(users.isActive, true)));
  vicePresidents.forEach((u) => recipientIds.add(u.id));

  // The chapter's head, who knows this particular group.
  const heads = await db
    .select({ userId: chapterMemberships.userId })
    .from(chapterMemberships)
    .where(
      and(
        eq(chapterMemberships.chapterId, membership.chapterId),
        eq(chapterMemberships.role, 'chapter_head'),
        eq(chapterMemberships.isActive, true),
      ),
    );
  heads.forEach((h) => recipientIds.add(h.userId));

  if (recipientIds.size === 0) throw validationError('Şu anda mesajı iletebileceğimiz bir yetkili bulunmuyor.');

  const title = `${KIND_LABEL[input.kind]} · ${child?.fullName ?? 'Öğrenci'}`;

  await db.transaction(async (tx) => {
    await tx.insert(notifications).values(
      [...recipientIds].map((userId) => ({
        userId,
        type: input.kind === 'excuse' ? 'parent_excuse' : 'parent_question',
        title,
        body,
        linkUrl: `/panel/gruplar/${membership.chapterId}/${membership.groupId}`,
      })),
    );

    await recordAudit(
      {
        actorUserId: scope.userId,
        actorName: 'Veli',
        action: AUDIT_ACTIONS.parentMessageSent,
        targetType: 'user',
        targetId: input.studentUserId,
        targetLabel: child?.fullName ?? null,
        chapterId: membership.chapterId,
        academicYearId: membership.academicYearId,
        after: { kind: input.kind },
      },
      tx,
    );
  });
}
