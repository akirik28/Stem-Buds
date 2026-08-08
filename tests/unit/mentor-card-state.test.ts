import { describe, expect, it } from 'vitest';
import { getMentorCardState } from '@/app/panel/gruplar/[chapterId]/[groupId]/mentor-card-state';

/**
 * Regression coverage for a real bug: the group detail page used to show
 * "Atanabilecek mentor yok..." (implying no mentor) whenever there were no
 * *alternative* candidates, even when a mentor was already assigned — making
 * an already-configured group look broken. These pin the four distinct
 * states so that mistake can't silently come back.
 */
describe('getMentorCardState', () => {
  it('is a draft with no one eligible when there is no mentor and no candidates', () => {
    expect(getMentorCardState({ hasMentor: false, alternativeCandidateCount: 0 })).toBe(
      'draft_no_candidates',
    );
  });

  it('is a draft ready to assign when there is no mentor but candidates exist', () => {
    expect(getMentorCardState({ hasMentor: false, alternativeCandidateCount: 2 })).toBe(
      'draft_with_candidates',
    );
  });

  it('never reports "no mentor" once one is assigned, even with zero alternatives', () => {
    expect(getMentorCardState({ hasMentor: true, alternativeCandidateCount: 0 })).toBe(
      'assigned_no_alternatives',
    );
  });

  it('reports an assigned mentor with alternatives available for reassignment', () => {
    expect(getMentorCardState({ hasMentor: true, alternativeCandidateCount: 3 })).toBe(
      'assigned_with_alternatives',
    );
  });
});
