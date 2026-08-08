/**
 * Centralized, named business-rule constants for the deterministic alert
 * engine. Nothing here is AI-decided — Groq has zero involvement in whether
 * any of these thresholds fire, who it notifies, or its official severity.
 *
 * These are the Online Ortaokul rules already defined in the original
 * management-alert source of truth. BİLSEM has no independently-defined
 * equivalent thresholds yet, so the same numbers are applied to both
 * Programs for now (Program-aware, not Program-blind: every rule still
 * evaluates strictly within one Program's own chapters/groups — see
 * `alert-engine.ts` — this constant is just the one shared default until a
 * genuinely different BİLSEM rule is defined).
 */
export const ALERT_THRESHOLDS = {
  /** Weekly Group attendance below this rate is `yellow`/attention. */
  attendanceYellowRate: 0.8,
  /** Weekly Group attendance below this rate is `red`/high attention. */
  attendanceRedRate: 0.65,
  /** A student with this many consecutive unexcused absences is `yellow`/attention. */
  consecutiveUnexcusedAbsences: 2,
  /** Group homework completion below this rate is `yellow`/attention. */
  homeworkYellowRate: 0.7,
  /** A student missing this many of their last N applicable assignments is `yellow`/attention. */
  homeworkMissedCount: 2,
  homeworkMissedWindow: 3,
  /** A Weekly Record still incomplete this long after the session ended is `red`. */
  weeklyRecordOverdueHours: 24,
  /** First stale-project stage: notifies the assigned Mentor + Chapter Head only. */
  projectStaleWarningDays: 7,
  /** Second stale-project stage: escalates the same episode to VICE_DIRECTOR + REGIONAL_DIRECTOR. */
  projectStaleEscalationDays: 14,
} as const;
