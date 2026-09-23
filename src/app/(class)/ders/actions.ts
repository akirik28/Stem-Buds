'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext } from '@/server/auth/context';
import {
  markHeadAbsent,
  markMentorAbsent,
  markRoomsSplit,
  setChapterMeetingUrl,
} from '@/server/services/class-mode-service';
import {
  finalizeAttendance,
  finalizePreviousHomeworkResults,
  setHomeworkDecision,
  updateWorkLogNarrative,
} from '@/server/services/weekly-work-service';
import { reportIssue } from '@/server/services/issue-service';
import { toUserMessage } from '@/server/errors';

export type StepState = { error?: string; success?: string };

/**
 * One action per step of the lesson guide. Each re-checks authorization in
 * the service it calls — the page decides what to show, never what is
 * allowed.
 */

async function run(fn: () => Promise<unknown>, success: string): Promise<StepState> {
  try {
    await fn();
    revalidatePath('/panel/ders');
    revalidatePath('/panel');
    return { success };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function saveChapterLinkAction(chapterId: string, meetingUrl: string): Promise<StepState> {
  const { scope, user } = await requireAuthContext();
  return run(
    () => setChapterMeetingUrl(scope, { chapterId, meetingUrl }, { id: user.id, name: user.fullName }),
    'Bağlantı kaydedildi.',
  );
}

export async function roomsSplitAction(input: {
  chapterId: string;
  academicYearId: string;
  weekNumber: number;
}): Promise<StepState> {
  const { scope, user } = await requireAuthContext();
  return run(
    () => markRoomsSplit(scope, input, { id: user.id, name: user.fullName }),
    'Mentörlere haber verildi.',
  );
}

export async function headAbsentAction(input: {
  chapterId: string;
  academicYearId: string;
  weekNumber: number;
  note: string;
}): Promise<StepState> {
  const { scope, user } = await requireAuthContext();
  return run(
    () => markHeadAbsent(scope, input, { id: user.id, name: user.fullName }),
    'Kaydedildi. Yönetim görecek.',
  );
}

export async function mentorAbsentAction(input: {
  weeklySessionId: string;
  groupId: string;
  note: string;
}): Promise<StepState> {
  const { scope, user } = await requireAuthContext();
  return run(
    () => markMentorAbsent(scope, input, { id: user.id, name: user.fullName }),
    'Kaydedildi. Chapter sorumlun görecek.',
  );
}

export async function saveAttendanceAction(
  weeklySessionId: string,
  records: { groupMembershipId: string; status: 'present' | 'late' | 'absent' | 'excused' }[],
): Promise<StepState> {
  const { user } = await requireAuthContext();
  return run(
    () => finalizeAttendance({ weeklySessionId, records, actor: { id: user.id, name: user.fullName } }),
    'Yoklama kaydedildi.',
  );
}

export async function savePreviousHomeworkAction(
  weeklySessionId: string,
  statuses: { groupMembershipId: string; status: 'done' | 'not_done' | 'excused' }[],
): Promise<StepState> {
  const { user } = await requireAuthContext();
  return run(
    () =>
      finalizePreviousHomeworkResults({
        weeklySessionId,
        statuses,
        actor: { id: user.id, name: user.fullName },
      }),
    'Ödev sonuçları kaydedildi.',
  );
}

export async function saveWeekAction(
  weeklySessionId: string,
  input: {
    whatWeDid: string;
    participation: 'most_active' | 'some_active' | 'low' | null;
    projectStage: 'idea' | 'research' | 'plan' | 'build' | 'results' | 'presentation' | null;
  },
): Promise<StepState> {
  const { user } = await requireAuthContext();
  return run(
    () =>
      updateWorkLogNarrative({
        weeklySessionId,
        whatWeDid: input.whatWeDid,
        participation: input.participation,
        projectStage: input.projectStage,
        actor: { id: user.id, name: user.fullName },
      }),
    'Hafta kaydedildi.',
  );
}

export async function saveNextHomeworkAction(input: {
  weeklySessionId: string;
  noHomework: boolean;
  description: string;
}): Promise<StepState> {
  const { user } = await requireAuthContext();
  return run(
    () =>
      setHomeworkDecision({
        weeklySessionId: input.weeklySessionId,
        noHomework: input.noHomework,
        description: input.noHomework ? null : input.description,
        actor: { id: user.id, name: user.fullName },
      }),
    input.noHomework ? 'Ödev yok olarak kaydedildi.' : 'Ödev kaydedildi.',
  );
}

export async function reportIssueFromClassAction(groupId: string, body: string): Promise<StepState> {
  const { scope, user } = await requireAuthContext();
  return run(
    () => reportIssue(scope, { groupId, body }, { id: user.id, name: user.fullName }),
    'İletildi. Önce mentöre gider.',
  );
}
