'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext, assertPermission } from '@/server/auth/context';
import { canManageProgramSettings, isExecutive } from '@/server/authz/policy';
import { activateAcademicYear, createAcademicYear, deleteAcademicYear } from '@/server/services/academic-year';
import { updateProgramSchedule } from '@/server/services/program-service';
import { parseMinuteOfDay } from '@/lib/format';
import { toUserMessage } from '@/server/errors';

export type ActionState = { error?: string; success?: string };

export async function createAcademicYearAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(isExecutive(context.scope.role));

  try {
    await createAcademicYear({
      label: String(formData.get('label') ?? ''),
      startDate: String(formData.get('startDate') ?? ''),
      endDate: String(formData.get('endDate') ?? ''),
      activate: formData.get('activate') === 'on',
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/ayarlar');
    return { success: 'Akademik yıl oluşturuldu.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function activateAcademicYearAction(yearId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(isExecutive(context.scope.role));

  try {
    await activateAcademicYear(yearId, { id: context.user.id, name: context.user.fullName });
    revalidatePath('/panel/ayarlar');
    return { success: 'Akademik yıl aktifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deleteAcademicYearAction(yearId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(isExecutive(context.scope.role));

  try {
    await deleteAcademicYear({ id: yearId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath('/panel/ayarlar');
    return { success: 'Akademik yıl silindi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateProgramScheduleAction(
  programId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageProgramSettings(context.scope));

  const dayRaw = String(formData.get('weeklyDayOfWeek') ?? '');
  const startRaw = String(formData.get('weeklyStartMinute') ?? '');
  const durationRaw = String(formData.get('weeklyDurationMinutes') ?? '');
  const cycleRaw = String(formData.get('cycleLengthWeeks') ?? '');

  const weeklyStartMinute = startRaw ? parseMinuteOfDay(startRaw) : null;
  if (startRaw && weeklyStartMinute === null) {
    return { error: 'Geçerli bir başlangıç saati girin (ör. 18:30).' };
  }

  try {
    await updateProgramSchedule({
      programId,
      weeklyDayOfWeek: dayRaw ? Number(dayRaw) : null,
      weeklyStartMinute,
      weeklyDurationMinutes: durationRaw ? Number(durationRaw) : null,
      cycleLengthWeeks: cycleRaw ? Number(cycleRaw) : null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/ayarlar');
    return { success: 'Program ayarları güncellendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
