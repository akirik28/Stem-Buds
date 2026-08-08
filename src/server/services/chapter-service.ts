import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapterMemberships, chapters, groups, users } from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type Chapter = typeof chapters.$inferSelect;

const CODE_PATTERN = /^[A-Z0-9]{2,16}$/;

export function normalizeChapterCode(raw: string): string {
  return raw.trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');
}

/**
 * Lists chapters, optionally narrowed to one program — the query-level half of
 * the "Tüm Programlar / Online Ortaokul Programı / BİLSEM Programı" switcher.
 *
 * This is a convenience filter, not an authorization boundary: callers must
 * still intersect the result with the caller's `AccessScope` (a Chapter Head
 * only ever sees their own `headChapterIds` regardless of this filter).
 */
export async function listChapters(filter: { programId?: string } = {}): Promise<Chapter[]> {
  const query = getDb().select().from(chapters).orderBy(desc(chapters.createdAt));
  if (filter.programId) {
    return query.where(eq(chapters.programId, filter.programId));
  }
  return query;
}

export async function getChapterById(id: string): Promise<Chapter | null> {
  const [row] = await getDb().select().from(chapters).where(eq(chapters.id, id)).limit(1);
  return row ?? null;
}

export type CreateChapterInput = {
  programId: string;
  code: string;
  name: string;
  city?: string | null;
  actor: { id: string | null; name: string };
};

export async function createChapter(input: CreateChapterInput): Promise<Chapter> {
  const code = normalizeChapterCode(input.code);
  if (!CODE_PATTERN.test(code)) {
    throw validationError('Chapter kodu 2-16 karakter olmalı ve yalnızca büyük harf/rakam içermeli.');
  }
  const name = input.name.trim();
  if (name.length < 2) throw validationError('Chapter adı zorunludur.');
  if (!input.programId) throw validationError('Chapter bir programa bağlı olmalıdır.');

  return getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.code, code));
    if (existing.length > 0) throw conflict('Bu chapter kodu zaten kullanılıyor.');

    const [created] = await tx
      .insert(chapters)
      .values({ programId: input.programId, code, name, city: input.city?.trim() || null })
      .returning();
    if (!created) throw conflict('Chapter oluşturulamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.chapterCreated,
        targetType: 'chapter',
        targetId: created.id,
        targetLabel: created.code,
        chapterId: created.id,
        after: { code, name, city: input.city ?? null, programId: input.programId },
      },
      tx,
    );

    return created;
  });
}

export type UpdateChapterInput = {
  id: string;
  name?: string;
  city?: string | null;
  isActive?: boolean;
  actor: { id: string | null; name: string };
};

export async function updateChapter(input: UpdateChapterInput): Promise<Chapter> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(chapters).where(eq(chapters.id, input.id)).limit(1);
    if (!before) throw notFound('Chapter bulunamadı.');

    const patch: Partial<typeof chapters.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length < 2) throw validationError('Chapter adı zorunludur.');
      patch.name = trimmed;
    }
    if (input.city !== undefined) patch.city = input.city?.trim() || null;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    const [updated] = await tx.update(chapters).set(patch).where(eq(chapters.id, input.id)).returning();
    if (!updated) throw notFound('Chapter bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.chapterUpdated,
        targetType: 'chapter',
        targetId: updated.id,
        targetLabel: updated.code,
        chapterId: updated.id,
        before: { name: before.name, city: before.city, isActive: before.isActive },
        after: { name: updated.name, city: updated.city, isActive: updated.isActive },
      },
      tx,
    );

    return updated;
  });
}

export type PublishChapterInput = {
  id: string;
  isPublic: boolean;
  publicDescription?: string | null;
  actor: { id: string | null; name: string };
};

/**
 * Sets public-website visibility for a chapter.
 *
 * Only an already "Doğrulanmış" chapter that Executive Management explicitly
 * flips `isPublic` on ever appears on the public site — schools that were
 * merely contacted stay invisible by default.
 */
export async function publishChapter(input: PublishChapterInput): Promise<Chapter> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(chapters).where(eq(chapters.id, input.id)).limit(1);
    if (!before) throw notFound('Chapter bulunamadı.');

    const [updated] = await tx
      .update(chapters)
      .set({
        isPublic: input.isPublic,
        publicDescription:
          input.publicDescription !== undefined
            ? input.publicDescription?.trim() || null
            : before.publicDescription,
        publishedAt: input.isPublic ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(chapters.id, input.id))
      .returning();
    if (!updated) throw notFound('Chapter bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.chapterPublished,
        targetType: 'chapter',
        targetId: updated.id,
        targetLabel: updated.code,
        chapterId: updated.id,
        before: { isPublic: before.isPublic },
        after: { isPublic: updated.isPublic },
      },
      tx,
    );

    return updated;
  });
}

export type ChapterMember = {
  id: string;
  username: string;
  fullName: string;
  role: 'mentor' | 'student';
};

/** The chapter's responsible Chapter Head for the given academic year, if assigned. */
export async function getChapterHead(
  chapterId: string,
  academicYearId: string,
): Promise<{ id: string; fullName: string; username: string } | null> {
  const [row] = await getDb()
    .select({ id: users.id, fullName: users.fullName, username: users.username })
    .from(chapterMemberships)
    .innerJoin(users, eq(users.id, chapterMemberships.userId))
    .where(
      and(
        eq(chapterMemberships.chapterId, chapterId),
        eq(chapterMemberships.academicYearId, academicYearId),
        eq(chapterMemberships.isActive, true),
        eq(chapterMemberships.role, 'chapter_head'),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Mentors and students who belong to a chapter (for the current academic
 * year), used to populate "add member" pickers on the chapter's groups —
 * only people already provisioned into the chapter can be added to one of
 * its groups.
 */
export async function listChapterMembers(
  chapterId: string,
  academicYearId: string,
): Promise<ChapterMember[]> {
  const rows = await getDb()
    .select({ id: users.id, username: users.username, fullName: users.fullName, role: users.role })
    .from(chapterMemberships)
    .innerJoin(users, eq(users.id, chapterMemberships.userId))
    .where(
      and(
        eq(chapterMemberships.chapterId, chapterId),
        eq(chapterMemberships.academicYearId, academicYearId),
        eq(chapterMemberships.isActive, true),
        inArray(chapterMemberships.role, ['mentor', 'student']),
      ),
    )
    .orderBy(users.fullName);

  return rows.map((row) => ({ ...row, role: row.role as 'mentor' | 'student' }));
}

/**
 * Archives a chapter (`isActive = false`) rather than destroying it —
 * appropriate once it has any real history (a group, a member). It stays
 * fully visible in historical records; only new activity is discouraged.
 */
export async function archiveChapter(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<Chapter> {
  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(chapters)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(chapters.id, input.id))
      .returning();
    if (!updated) throw notFound('Chapter bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.chapterArchived,
        targetType: 'chapter',
        targetId: updated.id,
        targetLabel: updated.code,
        chapterId: updated.id,
      },
      tx,
    );
    return updated;
  });
}

export async function reactivateChapter(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<Chapter> {
  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(chapters)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(chapters.id, input.id))
      .returning();
    if (!updated) throw notFound('Chapter bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.chapterReactivated,
        targetType: 'chapter',
        targetId: updated.id,
        targetLabel: updated.code,
        chapterId: updated.id,
      },
      tx,
    );
    return updated;
  });
}

/**
 * Hard-deletes a chapter — safe only when it was never actually used: no
 * groups and no member assigned to it yet. A chapter with any real history
 * is never destructible this way; `archiveChapter` is the correct action
 * for that case. The database's own foreign-key constraints
 * (`groups`/`chapter_memberships` both `RESTRICT` on `chapter_id`) back this
 * check up regardless of what the application layer does or doesn't verify.
 */
export async function deleteChapter(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(chapters).where(eq(chapters.id, input.id)).limit(1);
    if (!target) throw notFound('Chapter bulunamadı.');

    const [group] = await tx.select({ id: groups.id }).from(groups).where(eq(groups.chapterId, input.id)).limit(1);
    const [membership] = await tx
      .select({ id: chapterMemberships.id })
      .from(chapterMemberships)
      .where(eq(chapterMemberships.chapterId, input.id))
      .limit(1);
    if (group || membership) {
      throw validationError('Bu chapter’a ait grup veya üyelik kayıtları var; silmek yerine pasifleştirin.');
    }

    await tx.delete(chapters).where(eq(chapters.id, input.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.chapterDeleted,
        targetType: 'chapter',
        targetId: target.id,
        targetLabel: target.code,
        before: { code: target.code, name: target.name },
      },
      tx,
    );
  });
}
