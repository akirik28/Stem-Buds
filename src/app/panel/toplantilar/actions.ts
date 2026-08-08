'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import { createMentorMeeting, createProgramMeeting, setMentorMeetingAttendance, updateMentorMeetingNotes } from '@/server/services/mentor-meeting-service';
import { toUserMessage } from '@/server/errors';

export type MeetingActionState = { error?: string; success?: string };

export async function createMentorMeetingAction(
  chapterId: string,
  academicYearId: string,
  _prev: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const context = await requireAuthContext();
  try {
    const startsAt = new Date(String(formData.get('startsAt')));
    const endsAt = new Date(String(formData.get('endsAt')));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { error: 'Geçerli bir tarih/saat girin.' };
    }
    const meeting = await createMentorMeeting({
      scope: context.scope,
      chapterId,
      academicYearId,
      title: String(formData.get('title') ?? ''),
      startsAt,
      endsAt,
      agenda: String(formData.get('agenda') ?? ''),
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/toplantilar');
    return { success: `"${meeting.title}" oluşturuldu.` };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function createProgramMeetingAction(
  programId: string,
  academicYearId: string,
  _prev: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const context = await requireAuthContext();
  try {
    const startsAt = new Date(String(formData.get('startsAt')));
    const endsAt = new Date(String(formData.get('endsAt')));
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return { error: 'Geçerli bir tarih/saat girin.' };
    }
    const participantUserIds = formData.getAll('participantUserIds').map(String);
    const meeting = await createProgramMeeting({
      scope: context.scope,
      programId,
      academicYearId,
      title: String(formData.get('title') ?? ''),
      startsAt,
      endsAt,
      agenda: String(formData.get('agenda') ?? ''),
      participantUserIds,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/toplantilar');
    return { success: `"${meeting.title}" oluşturuldu.` };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function updateMeetingNotesAction(meetingId: string, _prev: MeetingActionState, formData: FormData): Promise<MeetingActionState> {
  const context = await requireAuthContext();
  try {
    await updateMentorMeetingNotes({
      scope: context.scope,
      meetingId,
      discussionTopics: String(formData.get('discussionTopics') ?? ''),
      groupEvaluations: String(formData.get('groupEvaluations') ?? ''),
      decisions: String(formData.get('decisions') ?? ''),
      notes: String(formData.get('notes') ?? ''),
      nextMeetingDate: String(formData.get('nextMeetingDate') ?? '') || null,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath(`/panel/toplantilar/${meetingId}`);
    return { success: 'Kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function setAttendanceAction(
  meetingId: string,
  mentorIds: string[],
  _prev: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const context = await requireAuthContext();
  try {
    const records = mentorIds.map((userId) => ({
      userId,
      status: (formData.get(`status-${userId}`) as 'present' | 'absent' | 'excused' | null) ?? 'present',
    }));
    await setMentorMeetingAttendance({ scope: context.scope, meetingId, records, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath(`/panel/toplantilar/${meetingId}`);
    return { success: 'Katılım kaydedildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
