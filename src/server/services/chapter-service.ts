import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapters } from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type Chapter = typeof chapters.$inferSelect;

const CODE_PATTERN = /^[A-Z0-9]{2,16}$/;

export function normalizeChapterCode(raw: string): string {
  return raw.trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');
}

export async function listChapters(): Promise<Chapter[]> {
  return getDb().select().from(chapters).orderBy(desc(chapters.createdAt));
}

export async function getChapterById(id: string): Promise<Chapter | null> {
  const [row] = await getDb().select().from(chapters).where(eq(chapters.id, id)).limit(1);
  return row ?? null;
}

export type CreateChapterInput = {
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

  return getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: chapters.id }).from(chapters).where(eq(chapters.code, code));
    if (existing.length > 0) throw conflict('Bu chapter kodu zaten kullanılıyor.');

    const [created] = await tx
      .insert(chapters)
      .values({ code, name, city: input.city?.trim() || null })
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
        after: { code, name, city: input.city ?? null },
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
