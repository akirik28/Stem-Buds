import { eq } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { programs, programSettings } from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import { PROGRAM_SEEDS, type ProgramKey } from '@/server/domain/program';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type Program = typeof programs.$inferSelect;
export type ProgramSettings = typeof programSettings.$inferSelect;

/**
 * Inserts the organization's two programs if they are not already present.
 *
 * Safe to call on every deploy/bootstrap/test run: the unique index on
 * `programs.key` makes this idempotent, so it can never create duplicates or
 * clobber a program an executive has since renamed. This is core reference
 * data describing the real programs STEM & BUDS runs — not demo/fake content —
 * so unlike development seed data it is expected to run in production too,
 * exactly once, the first time.
 */
export async function ensureCorePrograms(db: Database = getDb()): Promise<void> {
  for (const seed of PROGRAM_SEEDS) {
    await db
      .insert(programs)
      .values({
        key: seed.key,
        name: seed.name,
        shortName: seed.shortName,
        description: seed.description,
      })
      .onConflictDoNothing({ target: programs.key });
  }
}

export async function listPrograms(): Promise<Program[]> {
  return getDb().select().from(programs).orderBy(programs.createdAt);
}

export async function getProgramByKey(key: ProgramKey): Promise<Program | null> {
  const [row] = await getDb().select().from(programs).where(eq(programs.key, key)).limit(1);
  return row ?? null;
}

export async function getProgramById(id: string): Promise<Program | null> {
  const [row] = await getDb().select().from(programs).where(eq(programs.id, id)).limit(1);
  return row ?? null;
}

/**
 * A program's settings row, auto-created on first read with every field
 * unconfigured — the same "not set yet" contract Phase 1 established for the
 * (then organization-wide) weekly schedule, now per program.
 */
export async function getOrCreateProgramSettings(programId: string): Promise<ProgramSettings> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(programSettings)
    .where(eq(programSettings.programId, programId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(programSettings)
    .values({ programId })
    .onConflictDoNothing({ target: programSettings.programId })
    .returning();
  if (created) return created;

  // Lost a race with a concurrent first read; the other insert already landed.
  const [row] = await db
    .select()
    .from(programSettings)
    .where(eq(programSettings.programId, programId))
    .limit(1);
  if (!row) throw notFound('Program ayarları oluşturulamadı.');
  return row;
}

export type UpdateProgramScheduleInput = {
  programId: string;
  weeklyDayOfWeek: number | null;
  weeklyStartMinute: number | null;
  weeklyDurationMinutes: number | null;
  timezone?: string;
  cycleLengthWeeks?: number | null;
  actor: { id: string | null; name: string };
};

/**
 * Sets a single program's weekly working slot and cycle length.
 *
 * Never hard-coded, never shared across programs: the Online Ortaokul
 * Programı's Zoom slot and the BİLSEM Programı's own schedule are configured
 * — and can be unset — completely independently of one another.
 */
export async function updateProgramSchedule(
  input: UpdateProgramScheduleInput,
): Promise<ProgramSettings> {
  if (input.weeklyDayOfWeek !== null && (input.weeklyDayOfWeek < 1 || input.weeklyDayOfWeek > 7)) {
    throw validationError('Haftanın günü 1 (Pazartesi) ile 7 (Pazar) arasında olmalı.');
  }
  if (
    input.weeklyStartMinute !== null &&
    (input.weeklyStartMinute < 0 || input.weeklyStartMinute >= 24 * 60)
  ) {
    throw validationError('Geçerli bir başlangıç saati girin.');
  }
  if (input.weeklyDurationMinutes !== null && input.weeklyDurationMinutes <= 0) {
    throw validationError('Süre pozitif bir değer olmalı.');
  }

  await getOrCreateProgramSettings(input.programId);
  const db = getDb();

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(programSettings)
      .where(eq(programSettings.programId, input.programId))
      .limit(1);
    if (!before) throw notFound('Program ayarları bulunamadı.');

    const [updated] = await tx
      .update(programSettings)
      .set({
        weeklyDayOfWeek: input.weeklyDayOfWeek,
        weeklyStartMinute: input.weeklyStartMinute,
        weeklyDurationMinutes: input.weeklyDurationMinutes,
        timezone: input.timezone ?? before.timezone,
        cycleLengthWeeks:
          input.cycleLengthWeeks !== undefined ? input.cycleLengthWeeks : before.cycleLengthWeeks,
        configuredAt: new Date(),
        updatedById: input.actor.id,
        updatedAt: new Date(),
      })
      .where(eq(programSettings.programId, input.programId))
      .returning();
    if (!updated) throw notFound('Program ayarları bulunamadı.');

    const [program] = await tx.select().from(programs).where(eq(programs.id, input.programId)).limit(1);

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.programScheduleChanged,
        targetType: 'program_settings',
        targetId: updated.id,
        targetLabel: program?.name ?? input.programId,
        before: {
          weeklyDayOfWeek: before.weeklyDayOfWeek,
          weeklyStartMinute: before.weeklyStartMinute,
          weeklyDurationMinutes: before.weeklyDurationMinutes,
        },
        after: {
          weeklyDayOfWeek: updated.weeklyDayOfWeek,
          weeklyStartMinute: updated.weeklyStartMinute,
          weeklyDurationMinutes: updated.weeklyDurationMinutes,
        },
      },
      tx,
    );

    return updated;
  });
}
