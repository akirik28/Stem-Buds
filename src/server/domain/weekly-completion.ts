/**
 * Whether a weekly session's work record is complete — computed from
 * authoritative server data only, never trusted from client input.
 *
 * Mirrors the master spec's exact requirement list: attendance finalized,
 * "Bu hafta projede ne yaptınız?" filled in, next-week goal filled in,
 * project status selected, next homework decided (assignment or explicit
 * "Ödev yok"), previous homework results finalized *when a previous
 * assignment was actually due at this session*, and mentor approval.
 */
export type SessionCompletionInput = {
  attendanceFinalized: boolean;
  whatWeDid: string | null;
  nextWeekGoal: string | null;
  projectHealth: string | null;
  homeworkDecided: boolean;
  previousHomeworkApplicable: boolean;
  previousHomeworkFinalized: boolean;
  mentorApproved: boolean;
};

export type SessionRequirement =
  | 'attendance'
  | 'what_we_did'
  | 'next_week_goal'
  | 'project_health'
  | 'homework_decision'
  | 'previous_homework_results'
  | 'mentor_approval';

const NON_EMPTY = (value: string | null): boolean => value !== null && value.trim().length > 0;

/** Every requirement not yet satisfied, in the order a mentor would resolve them. */
export function missingSessionRequirements(input: SessionCompletionInput): SessionRequirement[] {
  const missing: SessionRequirement[] = [];
  if (!input.attendanceFinalized) missing.push('attendance');
  if (!NON_EMPTY(input.whatWeDid)) missing.push('what_we_did');
  if (!NON_EMPTY(input.nextWeekGoal)) missing.push('next_week_goal');
  if (!input.projectHealth) missing.push('project_health');
  if (!input.homeworkDecided) missing.push('homework_decision');
  if (input.previousHomeworkApplicable && !input.previousHomeworkFinalized) {
    missing.push('previous_homework_results');
  }
  if (!input.mentorApproved) missing.push('mentor_approval');
  return missing;
}

export function isSessionComplete(input: SessionCompletionInput): boolean {
  return missingSessionRequirements(input).length === 0;
}

export const sessionRequirementLabels: Record<SessionRequirement, string> = {
  attendance: 'Katılım tamamlanmalı',
  what_we_did: '"Bu hafta projede ne yaptınız?" doldurulmalı',
  next_week_goal: 'Gelecek hafta hedefi girilmeli',
  project_health: 'Proje durumu seçilmeli',
  homework_decision: 'Bu haftanın ödevi belirlenmeli (veya "Ödev yok" seçilmeli)',
  previous_homework_results: 'Önceki haftanın ödev sonuçları işlenmeli',
  mentor_approval: 'Mentor onayı gerekiyor',
};
