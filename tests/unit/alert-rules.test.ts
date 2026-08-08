import { describe, expect, it } from 'vitest';
import {
  evaluateAttendanceRate,
  evaluateHomeworkRate,
  evaluateProjectHealthAlert,
  evaluateProjectStaleness,
  hasConsecutiveUnexcusedAbsences,
  hasMissedRecentHomework,
  isMilestoneOverdue,
  isWeeklyRecordOverdue,
} from '@/server/domain/alert-rules';

describe('evaluateAttendanceRate', () => {
  it('is red below 65%', () => {
    expect(evaluateAttendanceRate(6, 10)).toEqual({ severity: 'red', rate: 0.6 });
  });
  it('is yellow between 65% and 80%', () => {
    expect(evaluateAttendanceRate(7, 10)).toEqual({ severity: 'yellow', rate: 0.7 });
  });
  it('is null at or above 80%', () => {
    expect(evaluateAttendanceRate(8, 10)).toBeNull();
    expect(evaluateAttendanceRate(10, 10)).toBeNull();
  });
  it('is null with no students', () => {
    expect(evaluateAttendanceRate(0, 0)).toBeNull();
  });
});

describe('evaluateHomeworkRate', () => {
  it('is yellow below 70%', () => {
    expect(evaluateHomeworkRate(6, 10)).toEqual({ severity: 'yellow', rate: 0.6 });
  });
  it('is null at or above 70%', () => {
    expect(evaluateHomeworkRate(7, 10)).toBeNull();
  });
  it('is null with nothing applicable', () => {
    expect(evaluateHomeworkRate(0, 0)).toBeNull();
  });
});

describe('hasConsecutiveUnexcusedAbsences', () => {
  it('is true for two absences in a row, newest first', () => {
    expect(hasConsecutiveUnexcusedAbsences(['absent', 'absent', 'present'])).toBe(true);
  });
  it('is false when a late/excused breaks the streak', () => {
    expect(hasConsecutiveUnexcusedAbsences(['absent', 'excused', 'absent'])).toBe(false);
    expect(hasConsecutiveUnexcusedAbsences(['late', 'absent'])).toBe(false);
  });
  it('is false with fewer than two records', () => {
    expect(hasConsecutiveUnexcusedAbsences(['absent'])).toBe(false);
  });
});

describe('hasMissedRecentHomework', () => {
  it('is true for 2 of the last 3 not_done', () => {
    expect(hasMissedRecentHomework(['not_done', 'done', 'not_done'])).toBe(true);
  });
  it('is false for only 1 of the last 3 not_done', () => {
    expect(hasMissedRecentHomework(['not_done', 'done', 'done'])).toBe(false);
  });
  it('excused does not count as missed', () => {
    expect(hasMissedRecentHomework(['not_done', 'excused', 'not_done'])).toBe(true);
    expect(hasMissedRecentHomework(['excused', 'excused', 'not_done'])).toBe(false);
  });
});

describe('isWeeklyRecordOverdue', () => {
  const sessionEnd = new Date('2026-09-05T19:00:00Z');
  it('is false when already completed', () => {
    expect(isWeeklyRecordOverdue(sessionEnd, new Date('2026-09-05T19:30:00Z'), new Date('2026-09-10T00:00:00Z'))).toBe(false);
  });
  it('is false within 24h of session end', () => {
    expect(isWeeklyRecordOverdue(sessionEnd, null, new Date('2026-09-06T18:00:00Z'))).toBe(false);
  });
  it('is true more than 24h after session end with no completion', () => {
    expect(isWeeklyRecordOverdue(sessionEnd, null, new Date('2026-09-06T20:00:00Z'))).toBe(true);
  });
});

describe('evaluateProjectHealthAlert', () => {
  it('is red for the latest reading being delayed', () => {
    expect(evaluateProjectHealthAlert(['delayed', 'on_track'])).toEqual({ severity: 'red', reason: 'red' });
  });
  it('is yellow for two consecutive attention readings', () => {
    expect(evaluateProjectHealthAlert(['attention', 'attention', 'on_track'])).toEqual({
      severity: 'yellow',
      reason: 'two_yellow',
    });
  });
  it('is null for a single attention reading', () => {
    expect(evaluateProjectHealthAlert(['attention', 'on_track'])).toBeNull();
  });
  it('is null for on_track', () => {
    expect(evaluateProjectHealthAlert(['on_track', 'delayed'])).toBeNull();
  });
});

describe('evaluateProjectStaleness — the exact 7/14-day ladder', () => {
  it('is null before 7 full days', () => {
    expect(evaluateProjectStaleness(6.9)).toBeNull();
  });
  it('is stage 7 at exactly 7 days', () => {
    expect(evaluateProjectStaleness(7)).toBe(7);
  });
  it('stays stage 7 through day 13', () => {
    expect(evaluateProjectStaleness(13.9)).toBe(7);
  });
  it('is stage 14 at exactly 14 days', () => {
    expect(evaluateProjectStaleness(14)).toBe(14);
  });
  it('stays stage 14 well beyond day 14', () => {
    expect(evaluateProjectStaleness(40)).toBe(14);
  });
});

describe('isMilestoneOverdue', () => {
  const today = new Date('2026-09-10T00:00:00Z');
  it('is true for a past due date still planned', () => {
    expect(isMilestoneOverdue('2026-09-01', 'planned', today)).toBe(true);
  });
  it('is false for a completed milestone even if overdue', () => {
    expect(isMilestoneOverdue('2026-09-01', 'completed', today)).toBe(false);
  });
  it('is false with no due date', () => {
    expect(isMilestoneOverdue(null, 'planned', today)).toBe(false);
  });
  it('is false for a future due date', () => {
    expect(isMilestoneOverdue('2026-09-20', 'in_progress', today)).toBe(false);
  });
});
