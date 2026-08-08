import { ALERT_THRESHOLDS } from './alert-thresholds';

/**
 * Pure, deterministic rule functions for the operational alert engine.
 * Every function here takes already-fetched facts and returns a decision —
 * no database access, no AI, fully unit-testable. `alert-engine.ts` is the
 * only place that fetches the facts and writes the resulting alert rows.
 */

export type AlertSeverity = 'info' | 'yellow' | 'red';

export type RateAlert = { severity: AlertSeverity; rate: number };

/** Weekly Group attendance: `< 65%` → red, `< 80%` → yellow, otherwise no alert. */
export function evaluateAttendanceRate(attendedCount: number, totalCount: number): RateAlert | null {
  if (totalCount <= 0) return null;
  const rate = attendedCount / totalCount;
  if (rate < ALERT_THRESHOLDS.attendanceRedRate) return { severity: 'red', rate };
  if (rate < ALERT_THRESHOLDS.attendanceYellowRate) return { severity: 'yellow', rate };
  return null;
}

/** Group homework completion `< 70%` → yellow, otherwise no alert. */
export function evaluateHomeworkRate(doneCount: number, applicableCount: number): RateAlert | null {
  if (applicableCount <= 0) return null;
  const rate = doneCount / applicableCount;
  if (rate < ALERT_THRESHOLDS.homeworkYellowRate) return { severity: 'yellow', rate };
  return null;
}

/** A student's most recent official attendance statuses, newest first. */
export function hasConsecutiveUnexcusedAbsences(
  recentStatusesNewestFirst: readonly ('present' | 'late' | 'absent' | 'excused')[],
): boolean {
  const window = recentStatusesNewestFirst.slice(0, ALERT_THRESHOLDS.consecutiveUnexcusedAbsences);
  return window.length === ALERT_THRESHOLDS.consecutiveUnexcusedAbsences && window.every((s) => s === 'absent');
}

/** A student missing 2 of their last 3 applicable (non-excused) homework results. */
export function hasMissedRecentHomework(
  recentStatusesNewestFirst: readonly ('done' | 'not_done' | 'excused' | 'pending')[],
): boolean {
  const window = recentStatusesNewestFirst.slice(0, ALERT_THRESHOLDS.homeworkMissedWindow);
  const missed = window.filter((s) => s === 'not_done').length;
  return missed >= ALERT_THRESHOLDS.homeworkMissedCount;
}

/** A Weekly Record still incomplete more than 24h after the session ended. */
export function isWeeklyRecordOverdue(sessionEndedAt: Date, completedAt: Date | null, now: Date): boolean {
  if (completedAt !== null) return false;
  const hoursSince = (now.getTime() - sessionEndedAt.getTime()) / (1000 * 60 * 60);
  return hoursSince > ALERT_THRESHOLDS.weeklyRecordOverdueHours;
}

export type ProjectHealthAlert = { severity: AlertSeverity; reason: 'red' | 'two_yellow' };

/** One red project-health reading, or two consecutive yellow readings. */
export function evaluateProjectHealthAlert(
  recentHealthNewestFirst: readonly ('on_track' | 'attention' | 'delayed')[],
): ProjectHealthAlert | null {
  const latest = recentHealthNewestFirst[0];
  if (latest === 'delayed') return { severity: 'red', reason: 'red' };
  const lastTwo = recentHealthNewestFirst.slice(0, 2);
  if (lastTwo.length === 2 && lastTwo.every((h) => h === 'attention')) {
    return { severity: 'yellow', reason: 'two_yellow' };
  }
  return null;
}

export type ProjectStaleStage = 7 | 14 | null;

/**
 * The exact 7/14-day escalation ladder from the Phase 5 spec. `stage` is the
 * *highest* threshold currently crossed — the caller is responsible for
 * only notifying once per threshold crossing (see `alert-engine.ts`).
 */
export function evaluateProjectStaleness(daysSinceProgress: number): ProjectStaleStage {
  if (daysSinceProgress >= ALERT_THRESHOLDS.projectStaleEscalationDays) return 14;
  if (daysSinceProgress >= ALERT_THRESHOLDS.projectStaleWarningDays) return 7;
  return null;
}

/** A milestone whose due date has passed and which is not yet completed. */
export function isMilestoneOverdue(
  dueDate: string | null,
  status: 'planned' | 'in_progress' | 'completed',
  today: Date,
): boolean {
  if (!dueDate || status === 'completed') return false;
  return new Date(`${dueDate}T00:00:00Z`).getTime() < today.getTime();
}
