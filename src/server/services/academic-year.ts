import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { academicYears, chapterMemberships, groups } from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type AcademicYear = typeof academicYears.$inferSelect;

/** The single active academic year, or null when none has been created yet. */
export async function getActiveAcademicYear(): Promise<AcademicYear | null> {
  const [row] = await getDb()
    .select()
    .from(academicYears)
    .where(eq(academicYears.isActive, true))
    .limit(1);
  return row ?? null;
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  return getDb().select().from(academicYears).orderBy(desc(academicYears.startDate));
}

export async function getAcademicYearById(id: string): Promise<AcademicYear | null> {
  const [row] = await getDb().select().from(academicYears).where(eq(academicYears.id, id)).limit(1);
  return row ?? null;
}

export type CreateAcademicYearInput = {
  label: string;
  startDate: string;
  endDate: string;
  activate: boolean;
  actor: { id: string | null; name: string };
};

/**
 * Creates an academic year. Activating one deactivates the others in the same
 * transaction, so "exactly one active year" can never be briefly violated.
 */
export async function createAcademicYear(input: CreateAcademicYearInput): Promise<AcademicYear> {
  const label = input.label.trim();
  if (label.length === 0) throw validationError('Akademik yıl adı zorunludur.');
  if (input.endDate <= input.startDate) {
    throw validationError('Bitiş tarihi başlangıç tarihinden sonra olmalıdır.');
  }

  return getDb().transaction(async (tx) => {
    const existing = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(eq(academicYears.label, label))
      .limit(1);
    if (existing.length > 0) throw conflict('Bu akademik yıl zaten tanımlı.');

    if (input.activate) {
      await tx.update(academicYears).set({ isActive: false, updatedAt: new Date() });
    }

    const [created] = await tx
      .insert(academicYears)
      .values({
        label,
        startDate: input.startDate,
        endDate: input.endDate,
        isActive: input.activate,
      })
      .returning();

    if (!created) throw conflict('Akademik yıl oluşturulamadı.');

    if (input.activate) {
      await recordAudit(
        {
          actorUserId: input.actor.id,
          actorName: input.actor.name,
          action: AUDIT_ACTIONS.academicYearActivated,
          targetType: 'academic_year',
          targetId: created.id,
          targetLabel: created.label,
          after: { label: created.label },
        },
        tx,
      );
    }

    return created;
  });
}

/** Makes one academic year the active one and deactivates every other. */
export async function activateAcademicYear(
  id: string,
  actor: { id: string | null; name: string },
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx
      .select()
      .from(academicYears)
      .where(eq(academicYears.id, id))
      .limit(1);
    if (!target) throw validationError('Akademik yıl bulunamadı.');

    await tx.update(academicYears).set({ isActive: false, updatedAt: new Date() });
    await tx
      .update(academicYears)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(academicYears.id, id));

    await recordAudit(
      {
        actorUserId: actor.id,
        actorName: actor.name,
        action: AUDIT_ACTIONS.academicYearActivated,
        targetType: 'academic_year',
        targetId: target.id,
        targetLabel: target.label,
        after: { label: target.label },
      },
      tx,
    );
  });
}

/**
 * Hard-deletes an academic year — safe only when nothing was ever recorded
 * against it (no chapter memberships, no groups, and therefore nothing
 * downstream of those either). A year with real history is never
 * destructible this way; it stays preserved, simply inactive, once a later
 * year is activated.
 */
export async function deleteAcademicYear(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(academicYears).where(eq(academicYears.id, input.id)).limit(1);
    if (!target) throw notFound('Akademik yıl bulunamadı.');
    if (target.isActive) {
      throw validationError('Aktif akademik yıl silinemez. Önce başka bir yılı aktifleştirin.');
    }

    const [membership] = await tx
      .select({ id: chapterMemberships.id })
      .from(chapterMemberships)
      .where(eq(chapterMemberships.academicYearId, input.id))
      .limit(1);
    const [group] = await tx.select({ id: groups.id }).from(groups).where(eq(groups.academicYearId, input.id)).limit(1);
    if (membership || group) {
      throw validationError('Bu akademik yıla ait kayıtlar bulunuyor; geçmişi korumak için silinemez.');
    }

    await tx.delete(academicYears).where(eq(academicYears.id, input.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.academicYearDeleted,
        targetType: 'academic_year',
        targetId: target.id,
        targetLabel: target.label,
        before: { label: target.label },
      },
      tx,
    );
  });
}
