import { and, eq } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import {
  attendanceRecords,
  groupMemberships,
  homeworkAssignments,
  homeworkStudentStatuses,
  weeklySessions,
  weeklyWorkLogs,
} from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import {
  isSessionComplete,
  missingSessionRequirements,
  sessionRequirementLabels,
  type SessionRequirement,
} from '@/server/domain/weekly-completion';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type WeeklyWorkLog = typeof weeklyWorkLogs.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type HomeworkAssignment = typeof homeworkAssignments.$inferSelect;
export type HomeworkStudentStatus = typeof homeworkStudentStatuses.$inferSelect;

type Actor = { id: string | null; name: string };

/** Creates the work log row on first access — every session gets exactly one. */
export async function getOrCreateWorkLog(weeklySessionId: string, db: Database = getDb()): Promise<WeeklyWorkLog> {
  const [existing] = await db
    .select()
    .from(weeklyWorkLogs)
    .where(eq(weeklyWorkLogs.weeklySessionId, weeklySessionId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(weeklyWorkLogs)
    .values({ weeklySessionId })
    .onConflictDoNothing({ target: weeklyWorkLogs.weeklySessionId })
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(weeklyWorkLogs)
    .where(eq(weeklyWorkLogs.weeklySessionId, weeklySessionId))
    .limit(1);
  if (!row) throw notFound('Haftalık çalışma kaydı oluşturulamadı.');
  return row;
}

async function activeMembershipIds(groupId: string, db: Database, role?: 'mentor' | 'student') {
  const conditions = [eq(groupMemberships.groupId, groupId), eq(groupMemberships.isActive, true)];
  if (role) conditions.push(eq(groupMemberships.role, role));
  return db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(and(...conditions));
}

/**
 * Computes completion from the database and writes `completedAt` — the only
 * place that field is ever set. Called after every mutation below so the
 * flag can never drift from the data it is supposed to summarize.
 */
async function recomputeCompletion(weeklySessionId: string, db: Database): Promise<WeeklyWorkLog> {
  const workLog = await getOrCreateWorkLog(weeklySessionId, db);

  const [previousAssignment] = await db
    .select({ id: homeworkAssignments.id })
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.dueSessionId, weeklySessionId))
    .limit(1);

  const complete = isSessionComplete({
    attendanceFinalized: workLog.attendanceFinalizedAt !== null,
    whatWeDid: workLog.whatWeDid,
    nextWeekGoal: workLog.nextWeekGoal,
    projectHealth: workLog.projectHealth,
    homeworkDecided: await hasHomeworkDecision(weeklySessionId, db),
    previousHomeworkApplicable: previousAssignment !== undefined,
    previousHomeworkFinalized: workLog.previousHomeworkFinalizedAt !== null,
    mentorApproved: workLog.mentorApprovedAt !== null,
  });

  const [updated] = await db
    .update(weeklyWorkLogs)
    .set({ completedAt: complete ? (workLog.completedAt ?? new Date()) : null, updatedAt: new Date() })
    .where(eq(weeklyWorkLogs.id, workLog.id))
    .returning();
  return updated ?? workLog;
}

async function hasHomeworkDecision(weeklySessionId: string, db: Database): Promise<boolean> {
  const [row] = await db
    .select({ id: homeworkAssignments.id })
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.weeklySessionId, weeklySessionId))
    .limit(1);
  return row !== undefined;
}

/** Lists the requirements still missing for a session, in Turkish. */
export async function getMissingRequirements(
  weeklySessionId: string,
): Promise<{ code: SessionRequirement; label: string }[]> {
  const db = getDb();
  const workLog = await getOrCreateWorkLog(weeklySessionId, db);
  const [previousAssignment] = await db
    .select({ id: homeworkAssignments.id })
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.dueSessionId, weeklySessionId))
    .limit(1);

  const missing = missingSessionRequirements({
    attendanceFinalized: workLog.attendanceFinalizedAt !== null,
    whatWeDid: workLog.whatWeDid,
    nextWeekGoal: workLog.nextWeekGoal,
    projectHealth: workLog.projectHealth,
    homeworkDecided: await hasHomeworkDecision(weeklySessionId, db),
    previousHomeworkApplicable: previousAssignment !== undefined,
    previousHomeworkFinalized: workLog.previousHomeworkFinalizedAt !== null,
    mentorApproved: workLog.mentorApprovedAt !== null,
  });
  return missing.map((code) => ({ code, label: sessionRequirementLabels[code] }));
}

export type UpdateNarrativeInput = {
  weeklySessionId: string;
  whatWeDid?: string | null;
  outputs?: string | null;
  problems?: string | null;
  nextWeekGoal?: string | null;
  projectHealth?: 'on_track' | 'attention' | 'delayed' | null;
  actor: Actor;
};

/** Team Leader draft or mentor edit of the narrative/goal/project-status fields. */
export async function updateWorkLogNarrative(input: UpdateNarrativeInput): Promise<WeeklyWorkLog> {
  const db = getDb();
  await getOrCreateWorkLog(input.weeklySessionId, db);

  const patch: Partial<typeof weeklyWorkLogs.$inferInsert> = { updatedAt: new Date() };
  if (input.whatWeDid !== undefined) patch.whatWeDid = input.whatWeDid?.trim() || null;
  if (input.outputs !== undefined) patch.outputs = input.outputs?.trim() || null;
  if (input.problems !== undefined) patch.problems = input.problems?.trim() || null;
  if (input.nextWeekGoal !== undefined) patch.nextWeekGoal = input.nextWeekGoal?.trim() || null;
  if (input.projectHealth !== undefined) patch.projectHealth = input.projectHealth;
  patch.draftAuthorId = input.actor.id;
  patch.draftSubmittedAt = new Date();

  await db
    .update(weeklyWorkLogs)
    .set(patch)
    .where(eq(weeklyWorkLogs.weeklySessionId, input.weeklySessionId));

  return recomputeCompletion(input.weeklySessionId, db);
}

export type AttendanceInput = {
  groupMembershipId: string;
  status: 'present' | 'late' | 'absent' | 'excused';
  note?: string | null;
};

/** Finalizes official attendance for every active student in one transaction. */
export async function finalizeAttendance(input: {
  weeklySessionId: string;
  records: AttendanceInput[];
  actor: Actor;
}): Promise<WeeklyWorkLog> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(weeklySessions)
    .where(eq(weeklySessions.id, input.weeklySessionId))
    .limit(1);
  if (!session) throw notFound('Oturum bulunamadı.');

  const students = await activeMembershipIds(session.groupId, db, 'student');
  const studentIds = new Set(students.map((s) => s.id));
  const providedIds = new Set(input.records.map((r) => r.groupMembershipId));
  const missing = [...studentIds].filter((id) => !providedIds.has(id));
  if (missing.length > 0) {
    throw validationError('Tüm öğrenciler için katılım durumu girilmelidir.');
  }

  return db.transaction(async (tx) => {
    for (const record of input.records) {
      if (!studentIds.has(record.groupMembershipId)) continue; // ignore stale/foreign ids
      await tx
        .insert(attendanceRecords)
        .values({
          weeklySessionId: input.weeklySessionId,
          groupMembershipId: record.groupMembershipId,
          status: record.status,
          note: record.note?.trim() || null,
          recordedById: input.actor.id,
        })
        .onConflictDoUpdate({
          target: [attendanceRecords.weeklySessionId, attendanceRecords.groupMembershipId],
          set: {
            status: record.status,
            note: record.note?.trim() || null,
            recordedById: input.actor.id,
            updatedAt: new Date(),
          },
        });
    }

    await getOrCreateWorkLog(input.weeklySessionId, tx);
    await tx
      .update(weeklyWorkLogs)
      .set({ attendanceFinalizedAt: new Date(), attendanceFinalizedById: input.actor.id, updatedAt: new Date() })
      .where(eq(weeklyWorkLogs.weeklySessionId, input.weeklySessionId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.attendanceEdited,
        targetType: 'weekly_session',
        targetId: input.weeklySessionId,
        after: { recordCount: input.records.length },
      },
      tx,
    );

    return recomputeCompletion(input.weeklySessionId, tx);
  });
}

export type SetHomeworkInput = {
  weeklySessionId: string;
  noHomework: boolean;
  description?: string | null;
  dueDate?: string | null;
  actor: Actor;
};

/** Decides this week's homework — either a description, or explicit "Ödev yok". */
export async function setHomeworkDecision(input: SetHomeworkInput): Promise<HomeworkAssignment> {
  if (!input.noHomework && !input.description?.trim()) {
    throw validationError('Ödev açıklaması girin veya "Bu hafta ödev yok." seçeneğini işaretleyin.');
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(weeklySessions)
    .where(eq(weeklySessions.id, input.weeklySessionId))
    .limit(1);
  if (!session) throw notFound('Oturum bulunamadı.');

  return db.transaction(async (tx) => {
    let dueSessionId: string | null = null;
    if (!input.noHomework) {
      const [nextSession] = await tx
        .select({ id: weeklySessions.id })
        .from(weeklySessions)
        .where(and(eq(weeklySessions.groupId, session.groupId), eq(weeklySessions.weekNumber, session.weekNumber + 1)))
        .limit(1);
      dueSessionId = nextSession?.id ?? null;
    }

    const [existing] = await tx
      .select()
      .from(homeworkAssignments)
      .where(eq(homeworkAssignments.weeklySessionId, input.weeklySessionId))
      .limit(1);

    let assignment: HomeworkAssignment;
    if (existing) {
      const [updated] = await tx
        .update(homeworkAssignments)
        .set({
          noHomework: input.noHomework,
          description: input.noHomework ? null : input.description!.trim(),
          dueDate: input.dueDate ?? null,
          dueSessionId,
          updatedAt: new Date(),
        })
        .where(eq(homeworkAssignments.id, existing.id))
        .returning();
      if (!updated) throw conflict('Ödev güncellenemedi.');
      assignment = updated;
    } else {
      const [created] = await tx
        .insert(homeworkAssignments)
        .values({
          weeklySessionId: input.weeklySessionId,
          groupId: session.groupId,
          noHomework: input.noHomework,
          description: input.noHomework ? null : input.description!.trim(),
          dueDate: input.dueDate ?? null,
          dueSessionId,
          createdById: input.actor.id,
        })
        .returning();
      if (!created) throw conflict('Ödev oluşturulamadı.');
      assignment = created;

      if (!input.noHomework) {
        const students = await activeMembershipIds(session.groupId, tx, 'student');
        if (students.length > 0) {
          await tx
            .insert(homeworkStudentStatuses)
            .values(students.map((s) => ({ assignmentId: assignment.id, groupMembershipId: s.id })));
        }
      }
    }

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.homeworkEdited,
        targetType: 'homework_assignment',
        targetId: assignment.id,
        chapterId: null,
        after: { noHomework: input.noHomework },
      },
      tx,
    );

    await recomputeCompletion(input.weeklySessionId, tx);
    return assignment;
  });
}

export type FinalizePreviousHomeworkInput = {
  weeklySessionId: string;
  statuses: { groupMembershipId: string; status: 'done' | 'not_done' | 'excused'; note?: string | null }[];
  actor: Actor;
};

/** Marks the results of the homework that was due *at* this session. */
export async function finalizePreviousHomeworkResults(
  input: FinalizePreviousHomeworkInput,
): Promise<WeeklyWorkLog> {
  const db = getDb();
  const [assignment] = await db
    .select()
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.dueSessionId, input.weeklySessionId))
    .limit(1);
  if (!assignment) {
    throw validationError('Bu oturumda sonuçlandırılacak bir ödev bulunmuyor.');
  }

  return db.transaction(async (tx) => {
    for (const entry of input.statuses) {
      await tx
        .insert(homeworkStudentStatuses)
        .values({
          assignmentId: assignment.id,
          groupMembershipId: entry.groupMembershipId,
          status: entry.status,
          note: entry.note?.trim() || null,
          markedById: input.actor.id,
          markedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [homeworkStudentStatuses.assignmentId, homeworkStudentStatuses.groupMembershipId],
          set: {
            status: entry.status,
            note: entry.note?.trim() || null,
            markedById: input.actor.id,
            markedAt: new Date(),
            updatedAt: new Date(),
          },
        });
    }

    await tx
      .update(homeworkAssignments)
      .set({ resultsFinalizedAt: new Date(), updatedAt: new Date() })
      .where(eq(homeworkAssignments.id, assignment.id));

    await getOrCreateWorkLog(input.weeklySessionId, tx);
    await tx
      .update(weeklyWorkLogs)
      .set({ previousHomeworkFinalizedAt: new Date(), updatedAt: new Date() })
      .where(eq(weeklyWorkLogs.weeklySessionId, input.weeklySessionId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.homeworkStatusEdited,
        targetType: 'homework_assignment',
        targetId: assignment.id,
        after: { markedCount: input.statuses.length },
      },
      tx,
    );

    return recomputeCompletion(input.weeklySessionId, tx);
  });
}

/**
 * Mentor approval — the final gate. Refuses unless every other requirement is
 * already met, so approval can never be used to paper over an incomplete
 * record.
 */
export async function approveWeeklySession(input: { weeklySessionId: string; actor: Actor }): Promise<WeeklyWorkLog> {
  const db = getDb();
  const missing = await getMissingRequirements(input.weeklySessionId);
  const missingExceptApproval = missing.filter((m) => m.code !== 'mentor_approval');
  if (missingExceptApproval.length > 0) {
    throw validationError(
      `Onaylamadan önce şunlar tamamlanmalı: ${missingExceptApproval.map((m) => m.label).join(', ')}.`,
    );
  }

  return db.transaction(async (tx) => {
    await tx
      .update(weeklyWorkLogs)
      .set({ mentorApprovedAt: new Date(), mentorApprovedById: input.actor.id, updatedAt: new Date() })
      .where(eq(weeklyWorkLogs.weeklySessionId, input.weeklySessionId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.weeklyRecordApproved,
        targetType: 'weekly_session',
        targetId: input.weeklySessionId,
      },
      tx,
    );

    return recomputeCompletion(input.weeklySessionId, tx);
  });
}

export async function getWorkLogBySessionId(weeklySessionId: string): Promise<WeeklyWorkLog | null> {
  const [row] = await getDb()
    .select()
    .from(weeklyWorkLogs)
    .where(eq(weeklyWorkLogs.weeklySessionId, weeklySessionId))
    .limit(1);
  return row ?? null;
}

export async function getHomeworkAssignmentBySessionId(
  weeklySessionId: string,
): Promise<HomeworkAssignment | null> {
  const [row] = await getDb()
    .select()
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.weeklySessionId, weeklySessionId))
    .limit(1);
  return row ?? null;
}

export async function getPreviousHomeworkAssignment(weeklySessionId: string): Promise<HomeworkAssignment | null> {
  const [row] = await getDb()
    .select()
    .from(homeworkAssignments)
    .where(eq(homeworkAssignments.dueSessionId, weeklySessionId))
    .limit(1);
  return row ?? null;
}

export async function listAttendanceBySession(weeklySessionId: string): Promise<AttendanceRecord[]> {
  return getDb().select().from(attendanceRecords).where(eq(attendanceRecords.weeklySessionId, weeklySessionId));
}

export async function listHomeworkStatuses(assignmentId: string): Promise<HomeworkStudentStatus[]> {
  return getDb()
    .select()
    .from(homeworkStudentStatuses)
    .where(eq(homeworkStudentStatuses.assignmentId, assignmentId));
}
