/**
 * "Proje Yolculuğu" — a project's timeline, generated only from data that was
 * actually saved: each *finalized* weekly record contributes one entry (its
 * "Bu hafta çıkan sonuç/çıktılar", falling back to "Bu hafta projede ne
 * yaptınız?" when no separate output was recorded), interleaved with
 * completed milestones. Nothing here is invented — an incomplete week or an
 * unfinished milestone simply contributes no entry.
 */
export type JourneySessionInput = {
  weekNumber: number;
  scheduledStartAt: Date;
  whatWeDid: string | null;
  outputs: string | null;
  completedAt: Date | null;
};

export type JourneyMilestoneInput = {
  title: string;
  completedAt: Date | null;
};

export type JourneyEntry =
  | { type: 'session'; date: Date; weekNumber: number; label: string }
  | { type: 'milestone'; date: Date; label: string };

const NON_EMPTY = (value: string | null): value is string => value !== null && value.trim().length > 0;

export function buildProjectJourney(
  sessions: readonly JourneySessionInput[],
  milestones: readonly JourneyMilestoneInput[],
): JourneyEntry[] {
  const sessionEntries: JourneyEntry[] = sessions
    .filter((session) => session.completedAt !== null)
    .map((session) => ({
      type: 'session',
      date: session.scheduledStartAt,
      weekNumber: session.weekNumber,
      label: (NON_EMPTY(session.outputs) ? session.outputs : session.whatWeDid) ?? '',
    }));

  const milestoneEntries: JourneyEntry[] = milestones
    .filter((milestone): milestone is JourneyMilestoneInput & { completedAt: Date } => milestone.completedAt !== null)
    .map((milestone) => ({ type: 'milestone', date: milestone.completedAt, label: milestone.title }));

  return [...sessionEntries, ...milestoneEntries].sort((a, b) => a.date.getTime() - b.date.getTime());
}
