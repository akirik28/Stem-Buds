/**
 * Pure display logic for the group detail page's "Mentor" card.
 *
 * Separated from the page component so the four states below — the ones that
 * were previously conflated into one "no candidates" message regardless of
 * whether a mentor was already assigned — can be unit tested directly.
 */
export type MentorCardState =
  /** No mentor assigned yet, and nobody eligible to assign either. */
  | 'draft_no_candidates'
  /** No mentor assigned yet; the assignment form can be shown. */
  | 'draft_with_candidates'
  /** A mentor is assigned; no one else is eligible to replace them. */
  | 'assigned_no_alternatives'
  /** A mentor is assigned and at least one alternative could replace them. */
  | 'assigned_with_alternatives';

export function getMentorCardState(input: {
  hasMentor: boolean;
  alternativeCandidateCount: number;
}): MentorCardState {
  if (!input.hasMentor) {
    return input.alternativeCandidateCount > 0 ? 'draft_with_candidates' : 'draft_no_candidates';
  }
  return input.alternativeCandidateCount > 0 ? 'assigned_with_alternatives' : 'assigned_no_alternatives';
}
