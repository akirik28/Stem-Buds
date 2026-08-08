import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { chapterMemberships, chapters, mentorMeetingAttendance, mentorMeetings, users } from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import { canManageChapter, isExecutive, isMentor, isChapterHead, type AccessScope } from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * Two kinds of meeting share this one table (see the schema's own doc
 * comment): **chapter-scoped** (a Chapter Head's own mentor team — the
 * original shape) and **Program-scoped** (Regional Director/Vice
 * President, hand-picked participants across a whole Program, BİLSEM and
 * Online Ortaokul always kept separate — never a single meeting spanning
 * both). Every function below branches on which of `chapterId`/`programId`
 * is set rather than assuming chapter-scoped.
 */

export type MentorMeeting = typeof mentorMeetings.$inferSelect;
export type MeetingAttendanceRow = typeof mentorMeetingAttendance.$inferSelect;
export type MeetingParticipantCandidate = { userId: string; fullName: string; username: string; role: 'chapter_head' | 'mentor' };

/** Exported so the UI's edit controls render exactly when the mutating action would actually succeed. */
export function canManageMeeting(scope: AccessScope, meeting: MentorMeeting): boolean {
  if (meeting.chapterId) return canManageChapter(scope, meeting.chapterId);
  if (meeting.programId) return isExecutive(scope.role);
  return false;
}

/** The meeting's actual roster with display names — a chapter's mentor team, or a Program meeting's fixed invite list. */
export async function getMeetingParticipants(meeting: MentorMeeting): Promise<MeetingParticipantCandidate[]> {
  if (meeting.chapterId) {
    const rows = await listChapterMentorsForAttendance(meeting.chapterId, meeting.academicYearId);
    return rows.map((r) => ({ ...r, role: 'mentor' as const }));
  }
  const rows = await getDb()
    .select({ userId: users.id, fullName: users.fullName, username: users.username, role: users.role })
    .from(mentorMeetingAttendance)
    .innerJoin(users, eq(users.id, mentorMeetingAttendance.userId))
    .where(eq(mentorMeetingAttendance.meetingId, meeting.id))
    .orderBy(users.fullName);
  return rows.map((r) => ({ ...r, role: r.role === 'chapter_head' ? ('chapter_head' as const) : ('mentor' as const) }));
}

export function canViewMentorMeetings(scope: AccessScope, chapterId: string): boolean {
  if (canManageChapter(scope, chapterId)) return true;
  return isMentor(scope.role) && scope.memberChapterIds.includes(chapterId);
}

async function isMeetingParticipant(meetingId: string, userId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: mentorMeetingAttendance.id })
    .from(mentorMeetingAttendance)
    .where(and(eq(mentorMeetingAttendance.meetingId, meetingId), eq(mentorMeetingAttendance.userId, userId)))
    .limit(1);
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Chapter-scoped meetings (unchanged behavior)
// ---------------------------------------------------------------------------

export async function listMentorMeetings(scope: AccessScope, chapterId: string, academicYearId: string): Promise<MentorMeeting[]> {
  if (!canViewMentorMeetings(scope, chapterId)) return [];
  return getDb()
    .select()
    .from(mentorMeetings)
    .where(and(eq(mentorMeetings.chapterId, chapterId), eq(mentorMeetings.academicYearId, academicYearId)))
    .orderBy(mentorMeetings.startsAt);
}

export type CreateMentorMeetingInput = {
  scope: AccessScope;
  chapterId: string;
  academicYearId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  agenda?: string | null;
  actor: { id: string | null; name: string };
};

export async function createMentorMeeting(input: CreateMentorMeetingInput): Promise<MentorMeeting> {
  if (!canManageChapter(input.scope, input.chapterId)) throw validationError('Bu chapter için toplantı oluşturma yetkiniz yok.');

  const title = input.title.trim();
  if (title.length === 0) throw validationError('Toplantı başlığı zorunludur.');
  if (input.endsAt <= input.startsAt) throw validationError('Bitiş saati başlangıçtan sonra olmalıdır.');

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: count() })
      .from(mentorMeetings)
      .where(and(eq(mentorMeetings.chapterId, input.chapterId), eq(mentorMeetings.academicYearId, input.academicYearId)));
    const sequence = `Mentor Toplantısı #${(countRow?.value ?? 0) + 1}`;

    const [row] = await tx
      .insert(mentorMeetings)
      .values({
        chapterId: input.chapterId,
        programId: null,
        academicYearId: input.academicYearId,
        sequence,
        title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        agenda: input.agenda?.trim() || null,
        createdById: input.actor.id,
      })
      .returning();
    if (!row) throw notFound('Toplantı oluşturulamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.mentorMeetingCreated,
        targetType: 'mentor_meeting',
        targetId: row.id,
        targetLabel: row.title,
        chapterId: row.chapterId,
        academicYearId: row.academicYearId,
      },
      tx,
    );

    return row;
  });
}

export async function listChapterMentorsForAttendance(chapterId: string, academicYearId: string, db: Database = getDb()) {
  return db
    .select({ userId: chapterMemberships.userId, fullName: users.fullName, username: users.username })
    .from(chapterMemberships)
    .innerJoin(users, eq(users.id, chapterMemberships.userId))
    .where(and(eq(chapterMemberships.chapterId, chapterId), eq(chapterMemberships.academicYearId, academicYearId), eq(chapterMemberships.role, 'mentor'), eq(chapterMemberships.isActive, true)));
}

// ---------------------------------------------------------------------------
// Program-scoped meetings (Executive only, hand-picked participants)
// ---------------------------------------------------------------------------

/** Every Chapter Head and Mentor within one Program — the creation form's participant checklist. */
export async function listProgramMeetingCandidates(programId: string, academicYearId: string): Promise<MeetingParticipantCandidate[]> {
  const rows = await getDb()
    .select({ userId: chapterMemberships.userId, fullName: users.fullName, username: users.username, role: chapterMemberships.role })
    .from(chapterMemberships)
    .innerJoin(users, eq(users.id, chapterMemberships.userId))
    .innerJoin(chapters, eq(chapters.id, chapterMemberships.chapterId))
    .where(
      and(
        eq(chapters.programId, programId),
        eq(chapterMemberships.academicYearId, academicYearId),
        inArray(chapterMemberships.role, ['chapter_head', 'mentor']),
        eq(chapterMemberships.isActive, true),
      ),
    )
    .orderBy(users.fullName);
  return rows.filter((r): r is MeetingParticipantCandidate => r.role === 'chapter_head' || r.role === 'mentor');
}

export async function listProgramMeetings(scope: AccessScope, programId: string, academicYearId: string): Promise<MentorMeeting[]> {
  if (!isExecutive(scope.role)) return [];
  return getDb()
    .select()
    .from(mentorMeetings)
    .where(and(eq(mentorMeetings.programId, programId), eq(mentorMeetings.academicYearId, academicYearId)))
    .orderBy(mentorMeetings.startsAt);
}

export type CreateProgramMeetingInput = {
  scope: AccessScope;
  programId: string;
  academicYearId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  agenda?: string | null;
  participantUserIds: string[];
  actor: { id: string | null; name: string };
};

export async function createProgramMeeting(input: CreateProgramMeetingInput): Promise<MentorMeeting> {
  if (!isExecutive(input.scope.role)) throw validationError('Program toplantısı oluşturma yetkiniz yok.');

  const title = input.title.trim();
  if (title.length === 0) throw validationError('Toplantı başlığı zorunludur.');
  if (input.endsAt <= input.startsAt) throw validationError('Bitiş saati başlangıçtan sonra olmalıdır.');
  if (input.participantUserIds.length === 0) throw validationError('En az bir katılımcı seçmelisiniz.');

  // Never trust the client-supplied id list blindly — every participant
  // must actually be a Chapter Head/Mentor within *this* Program, which is
  // also exactly what keeps BİLSEM and Online Ortaokul participants from
  // ever ending up in the same meeting.
  const candidates = await listProgramMeetingCandidates(input.programId, input.academicYearId);
  const candidateIds = new Set(candidates.map((c) => c.userId));
  const participantIds = [...new Set(input.participantUserIds)];
  for (const id of participantIds) {
    if (!candidateIds.has(id)) throw validationError('Seçilen katılımcılardan biri bu Program’a ait değil.');
  }

  return getDb().transaction(async (tx) => {
    const [countRow] = await tx
      .select({ value: count() })
      .from(mentorMeetings)
      .where(and(eq(mentorMeetings.programId, input.programId), eq(mentorMeetings.academicYearId, input.academicYearId)));
    const sequence = `Mentor Toplantısı #${(countRow?.value ?? 0) + 1}`;

    const [row] = await tx
      .insert(mentorMeetings)
      .values({
        chapterId: null,
        programId: input.programId,
        academicYearId: input.academicYearId,
        sequence,
        title,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        agenda: input.agenda?.trim() || null,
        createdById: input.actor.id,
      })
      .returning();
    if (!row) throw notFound('Toplantı oluşturulamadı.');

    await tx.insert(mentorMeetingAttendance).values(participantIds.map((userId) => ({ meetingId: row.id, userId, status: 'present' as const })));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.mentorMeetingCreated,
        targetType: 'mentor_meeting',
        targetId: row.id,
        targetLabel: row.title,
        academicYearId: row.academicYearId,
        after: { programId: input.programId, participantCount: participantIds.length },
      },
      tx,
    );

    return row;
  });
}

/** Every Program-scoped meeting this Mentor/Chapter Head was invited to as a participant. */
export async function listMyInvitedProgramMeetings(scope: AccessScope): Promise<MentorMeeting[]> {
  if (!isMentor(scope.role) && !isChapterHead(scope.role)) return [];
  const rows = await getDb()
    .select({ meeting: mentorMeetings })
    .from(mentorMeetingAttendance)
    .innerJoin(mentorMeetings, eq(mentorMeetings.id, mentorMeetingAttendance.meetingId))
    .where(and(eq(mentorMeetingAttendance.userId, scope.userId), isNull(mentorMeetings.chapterId)))
    .orderBy(mentorMeetings.startsAt);
  return rows.map((r) => r.meeting);
}

// ---------------------------------------------------------------------------
// Shared: viewing one meeting, notes, attendance
// ---------------------------------------------------------------------------

export async function getMentorMeetingForViewer(scope: AccessScope, meetingId: string): Promise<MentorMeeting | null> {
  const [meeting] = await getDb().select().from(mentorMeetings).where(eq(mentorMeetings.id, meetingId)).limit(1);
  if (!meeting) return null;

  if (meeting.chapterId) {
    if (canViewMentorMeetings(scope, meeting.chapterId)) return meeting;
    return null;
  }
  if (isExecutive(scope.role)) return meeting;
  if (await isMeetingParticipant(meeting.id, scope.userId)) return meeting;
  return null;
}

export type UpdateMentorMeetingNotesInput = {
  scope: AccessScope;
  meetingId: string;
  discussionTopics?: string | null;
  groupEvaluations?: string | null;
  decisions?: string | null;
  notes?: string | null;
  nextMeetingDate?: string | null;
  actor: { id: string | null; name: string };
};

export async function updateMentorMeetingNotes(input: UpdateMentorMeetingNotesInput): Promise<MentorMeeting> {
  const [meeting] = await getDb().select().from(mentorMeetings).where(eq(mentorMeetings.id, input.meetingId)).limit(1);
  if (!meeting) throw notFound('Toplantı bulunamadı.');
  if (!canManageMeeting(input.scope, meeting)) throw validationError('Bu toplantıyı düzenleme yetkiniz yok.');

  const [updated] = await getDb()
    .update(mentorMeetings)
    .set({
      discussionTopics: input.discussionTopics?.trim() || null,
      groupEvaluations: input.groupEvaluations?.trim() || null,
      decisions: input.decisions?.trim() || null,
      notes: input.notes?.trim() || null,
      nextMeetingDate: input.nextMeetingDate || null,
      updatedAt: new Date(),
    })
    .where(eq(mentorMeetings.id, input.meetingId))
    .returning();
  if (!updated) throw notFound('Toplantı bulunamadı.');
  return updated;
}

export async function setMentorMeetingAttendance(input: {
  scope: AccessScope;
  meetingId: string;
  records: Array<{ userId: string; status: 'present' | 'absent' | 'excused' }>;
  actor: { id: string | null; name: string };
}): Promise<void> {
  const [meeting] = await getDb().select().from(mentorMeetings).where(eq(mentorMeetings.id, input.meetingId)).limit(1);
  if (!meeting) throw notFound('Toplantı bulunamadı.');
  if (!canManageMeeting(input.scope, meeting)) throw validationError('Bu toplantının katılımını düzenleme yetkiniz yok.');

  let eligibleIds: Set<string>;
  if (meeting.chapterId) {
    const eligible = await listChapterMentorsForAttendance(meeting.chapterId, meeting.academicYearId);
    eligibleIds = new Set(eligible.map((m) => m.userId));
  } else {
    // Program meetings: the participant list is fixed at creation time —
    // attendance can only be recorded for someone already invited.
    const existing = await listMentorMeetingAttendance(input.meetingId);
    eligibleIds = new Set(existing.map((a) => a.userId));
  }
  for (const record of input.records) {
    if (!eligibleIds.has(record.userId)) throw validationError('Yalnızca bu toplantının katılımcıları için katılım girilebilir.');
  }

  await getDb().transaction(async (tx) => {
    for (const record of input.records) {
      await tx
        .insert(mentorMeetingAttendance)
        .values({ meetingId: input.meetingId, userId: record.userId, status: record.status })
        .onConflictDoUpdate({
          target: [mentorMeetingAttendance.meetingId, mentorMeetingAttendance.userId],
          set: { status: record.status },
        });
    }
  });
}

export async function listMentorMeetingAttendance(meetingId: string): Promise<MeetingAttendanceRow[]> {
  return getDb().select().from(mentorMeetingAttendance).where(eq(mentorMeetingAttendance.meetingId, meetingId));
}
