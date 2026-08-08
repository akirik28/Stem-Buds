import { describe, expect, it } from 'vitest';
import { isSessionComplete, missingSessionRequirements } from '@/server/domain/weekly-completion';

const complete = {
  attendanceFinalized: true,
  whatWeDid: 'Veri seti üzerinde çalıştık.',
  nextWeekGoal: 'Modeli eğitmeye başlayacağız.',
  projectHealth: 'on_track',
  homeworkDecided: true,
  previousHomeworkApplicable: false,
  previousHomeworkFinalized: false,
  mentorApproved: true,
};

describe('isSessionComplete', () => {
  it('is complete when every requirement is satisfied and no previous homework was due', () => {
    expect(isSessionComplete(complete)).toBe(true);
    expect(missingSessionRequirements(complete)).toEqual([]);
  });

  it('is never complete client-side-only: a blank narrative field fails it', () => {
    expect(isSessionComplete({ ...complete, whatWeDid: '' })).toBe(false);
    expect(isSessionComplete({ ...complete, whatWeDid: '   ' })).toBe(false);
    expect(isSessionComplete({ ...complete, whatWeDid: null })).toBe(false);
  });

  it('requires previous homework results only when a previous assignment was actually due', () => {
    expect(
      isSessionComplete({ ...complete, previousHomeworkApplicable: true, previousHomeworkFinalized: false }),
    ).toBe(false);
    expect(
      isSessionComplete({ ...complete, previousHomeworkApplicable: true, previousHomeworkFinalized: true }),
    ).toBe(true);
    // Not applicable: absence of finalization does not block completion.
    expect(
      isSessionComplete({ ...complete, previousHomeworkApplicable: false, previousHomeworkFinalized: false }),
    ).toBe(true);
  });

  it('requires mentor approval as the final gate even when everything else is done', () => {
    expect(isSessionComplete({ ...complete, mentorApproved: false })).toBe(false);
  });

  it('lists every missing requirement, not just the first one', () => {
    const missing = missingSessionRequirements({
      attendanceFinalized: false,
      whatWeDid: null,
      nextWeekGoal: null,
      projectHealth: null,
      homeworkDecided: false,
      previousHomeworkApplicable: true,
      previousHomeworkFinalized: false,
      mentorApproved: false,
    });
    expect(missing).toEqual([
      'attendance',
      'what_we_did',
      'next_week_goal',
      'project_health',
      'homework_decision',
      'previous_homework_results',
      'mentor_approval',
    ]);
  });
});
