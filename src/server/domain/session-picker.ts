/**
 * Picks which weekly session a "Haftalık Çalışmalar" dashboard should
 * surface for a group: the nearest one that still needs attention, so a
 * mentor or student lands on the relevant week instead of week 1 of a
 * 40+ week generated schedule.
 */
export type SessionPickerInput = {
  weekNumber: number;
  scheduledStartAt: Date;
};

/**
 * The first session scheduled at or after `now`; if every session is
 * already in the past, the most recently passed one.
 */
export function pickCurrentSession<T extends SessionPickerInput>(
  sessions: readonly T[],
  now: Date,
): T | null {
  if (sessions.length === 0) return null;
  const sorted = [...sessions].sort((a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime());
  const upcoming = sorted.find((session) => session.scheduledStartAt.getTime() >= now.getTime());
  return upcoming ?? sorted[sorted.length - 1]!;
}
