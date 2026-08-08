import { and, desc, eq, inArray, ne, type SQL } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapters, complaints, groups, users } from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import {
  canAccessComplaint,
  canSeeComplaintReporter,
  isChapterHead,
  isExecutive,
  isStudent,
  type AccessScope,
  type ComplaintAccessInput,
} from '@/server/authz/policy';
import { getActiveAcademicYear } from './academic-year';
import { getChapterHead } from './chapter-service';
import { AUDIT_ACTIONS, recordAudit } from './audit';

/**
 * The confidential complaint channel ("⚠️ Şikâyet Bildir") — see
 * `complaints`' own doc comment in `db/schema/feedback.ts` for the two
 * privacy invariants this reuses unchanged: anonymous complaints carry no
 * reporter reference at all, and a complaint about a Chapter Head is always
 * stored at `scope = 'executive'` so no chapter-level query can reach it.
 */

export type Complaint = typeof complaints.$inferSelect;

const CHAPTER_HEAD_TARGETING_CATEGORIES = ['about_chapter_head'] as const;

function toAccessInput(row: Complaint): ComplaintAccessInput {
  return {
    chapterId: row.chapterId,
    scope: row.scope,
    targetUserId: row.targetUserId,
    reporterUserId: row.reporterUserId,
    isAnonymous: row.isAnonymous,
  };
}

export type SubmitComplaintInput = {
  scope: AccessScope;
  category: Complaint['category'];
  subject: string;
  body: string;
  isAnonymous: boolean;
  actor: { id: string | null; name: string };
};

/**
 * Only a Student (Team Leader included — same account role) may file a
 * complaint, always about their own chapter. The confidentiality `scope` is
 * never taken from client input: a complaint about a Chapter Head is always
 * forced to `'executive'` server-side. Likewise, `targetUserId` is never
 * accepted from the client — for `about_mentor`/`about_chapter_head` it is
 * *resolved* server-side from the reporter's own Group/chapter, so there is
 * no code path where a caller can name an arbitrary person as the target of
 * someone else's complaint.
 */
export async function submitComplaint(input: SubmitComplaintInput): Promise<Complaint> {
  if (!isStudent(input.scope.role)) throw validationError('Yalnızca öğrenciler şikâyet bildirebilir.');

  const chapterId = input.scope.memberChapterIds[0];
  if (!chapterId) throw validationError('Aktif bir chapter üyeliğiniz bulunmuyor.');
  const activeYear = await getActiveAcademicYear();
  if (!activeYear) throw validationError('Aktif akademik yıl bulunamadı.');

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (subject.length === 0 || subject.length > 200) throw validationError('Konu 1-200 karakter olmalıdır.');
  if (body.length === 0) throw validationError('Şikâyet içeriği boş olamaz.');

  let targetUserId: string | null = null;
  if (input.category === 'about_mentor') {
    const mentorGroups = await getDb()
      .select({ mentorUserId: groups.mentorUserId })
      .from(groups)
      .where(inArray(groups.id, [...input.scope.studentGroupIds]));
    const mentorIds = [...new Set(mentorGroups.map((g) => g.mentorUserId).filter((id): id is string => id !== null))];
    // Only auto-attach a target when it is unambiguous — a student in
    // several Groups with different mentors leaves it unresolved rather
    // than guessing which one the complaint is about.
    if (mentorIds.length === 1) targetUserId = mentorIds[0]!;
  } else if (input.category === 'about_chapter_head') {
    const head = await getChapterHead(chapterId, activeYear.id);
    targetUserId = head?.id ?? null;
  }

  const forcedScope: Complaint['scope'] = (CHAPTER_HEAD_TARGETING_CATEGORIES as readonly string[]).includes(input.category)
    ? 'executive'
    : 'chapter';

  const [row] = await getDb()
    .insert(complaints)
    .values({
      chapterId,
      academicYearId: activeYear.id,
      category: input.category,
      subject,
      body,
      isAnonymous: input.isAnonymous,
      reporterUserId: input.isAnonymous ? null : input.scope.userId,
      targetUserId,
      scope: forcedScope,
    })
    .returning();
  if (!row) throw notFound('Şikâyet oluşturulamadı.');

  await recordAudit({
    actorUserId: input.isAnonymous ? null : input.actor.id,
    actorName: input.isAnonymous ? 'Anonim' : input.actor.name,
    action: AUDIT_ACTIONS.complaintCreated,
    targetType: 'complaint',
    targetId: row.id,
    chapterId,
    after: { category: row.category, scope: row.scope },
  });

  return row;
}

export type ComplaintListFilter = { programId?: string; status?: Complaint['status'] };

/**
 * Chapter Head / Executive inbox, plus an identified reporter's own view of
 * their own complaints. Row-level `canAccessComplaint` is the single source
 * of truth this SQL mirrors — never diverge the two.
 */
export async function listComplaintsForViewer(scope: AccessScope, filter: ComplaintListFilter = {}): Promise<Complaint[]> {
  const db = getDb();
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(complaints.status, filter.status));

  if (isExecutive(scope.role)) {
    if (filter.programId) {
      const chapterRows = await db.select({ id: chapters.id }).from(chapters).where(eq(chapters.programId, filter.programId));
      conditions.push(inArray(complaints.chapterId, chapterRows.map((c) => c.id)));
    }
  } else if (isChapterHead(scope.role)) {
    if (scope.headChapterIds.length === 0) return [];
    conditions.push(inArray(complaints.chapterId, [...scope.headChapterIds]));
    conditions.push(ne(complaints.scope, 'executive'));
  } else {
    // Any other role sees only complaints they themselves identifiably filed.
    conditions.push(eq(complaints.reporterUserId, scope.userId));
  }

  const rows = await db
    .select()
    .from(complaints)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(complaints.createdAt))
    .limit(200);

  // `canAccessComplaint` is the single source of truth for row-level access
  // (in particular: a person a complaint targets can never read it, whatever
  // their role) — the SQL above is only a coarse pre-filter for efficiency.
  return rows.filter((row) => canAccessComplaint(scope, toAccessInput(row)));
}

export async function getComplaintForViewer(scope: AccessScope, complaintId: string): Promise<{ complaint: Complaint; canSeeReporter: boolean } | null> {
  const [row] = await getDb().select().from(complaints).where(eq(complaints.id, complaintId)).limit(1);
  if (!row) return null;
  const access = toAccessInput(row);
  if (!canAccessComplaint(scope, access)) return null;
  return { complaint: row, canSeeReporter: canSeeComplaintReporter(scope, access) };
}

function canManageComplaint(scope: AccessScope, row: Complaint): boolean {
  return canAccessComplaint(scope, toAccessInput(row)) && (isExecutive(scope.role) || isChapterHead(scope.role));
}

export async function setComplaintStatus(input: {
  complaintId: string;
  status: 'investigating' | 'resolved';
  resolutionNote?: string | null;
  scope: AccessScope;
  actor: { id: string | null; name: string };
}): Promise<Complaint> {
  if (input.status !== 'investigating' && input.status !== 'resolved') {
    throw validationError('Geçersiz durum.');
  }
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(complaints).where(eq(complaints.id, input.complaintId)).limit(1);
    if (!row) throw notFound('Şikâyet bulunamadı.');
    if (!canManageComplaint(input.scope, row)) throw validationError('Bu şikâyeti güncelleme yetkiniz yok.');
    if (input.status === 'resolved' && !input.resolutionNote?.trim()) {
      throw validationError('Sonuçlandırmadan önce bir çözüm notu girilmelidir.');
    }

    const [updated] = await tx
      .update(complaints)
      .set({
        status: input.status,
        resolutionNote: input.status === 'resolved' ? input.resolutionNote?.trim() : row.resolutionNote,
        resolvedAt: input.status === 'resolved' ? new Date() : row.resolvedAt,
        updatedAt: new Date(),
      })
      .where(eq(complaints.id, input.complaintId))
      .returning();
    if (!updated) throw notFound('Şikâyet bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.complaintStatusChanged,
        targetType: 'complaint',
        targetId: updated.id,
        chapterId: updated.chapterId,
        before: { status: row.status },
        after: { status: updated.status },
      },
      tx,
    );

    return updated;
  });
}

export async function assignComplaint(input: {
  complaintId: string;
  assigneeUserId: string;
  scope: AccessScope;
  actor: { id: string | null; name: string };
}): Promise<Complaint> {
  return getDb().transaction(async (tx) => {
    const [row] = await tx.select().from(complaints).where(eq(complaints.id, input.complaintId)).limit(1);
    if (!row) throw notFound('Şikâyet bulunamadı.');
    if (!canManageComplaint(input.scope, row)) throw validationError('Bu şikâyeti atama yetkiniz yok.');

    const [assignee] = await tx.select().from(users).where(eq(users.id, input.assigneeUserId)).limit(1);
    if (!assignee) throw notFound('Kullanıcı bulunamadı.');
    const assigneeIsExecutive = isExecutive(assignee.role);
    const assigneeIsHeadOfChapter = assignee.role === 'chapter_head';
    if (!assigneeIsExecutive && !assigneeIsHeadOfChapter) {
      throw validationError('Şikâyet yalnızca üst yönetim veya bir Chapter Head’e atanabilir.');
    }

    const [updated] = await tx
      .update(complaints)
      .set({ assignedToId: assignee.id, updatedAt: new Date() })
      .where(eq(complaints.id, input.complaintId))
      .returning();
    if (!updated) throw notFound('Şikâyet bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.complaintAssigned,
        targetType: 'complaint',
        targetId: updated.id,
        chapterId: updated.chapterId,
        after: { assignedToId: assignee.id },
      },
      tx,
    );

    return updated;
  });
}

export async function countOpenComplaints(scope: AccessScope, filter: ComplaintListFilter = {}): Promise<number> {
  const rows = await listComplaintsForViewer(scope, { ...filter, status: undefined });
  return rows.filter((r) => r.status !== 'resolved').length;
}
