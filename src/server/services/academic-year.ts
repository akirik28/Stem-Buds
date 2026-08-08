import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { academicYears } from '@/server/db/schema';

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
