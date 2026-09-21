/**
 * An academic-year window that always begins in the future.
 *
 * Weekly session generation deliberately creates *future* sessions only (see
 * the `future only` guard in `weekly-session-service.ts`), which is correct
 * product behaviour: the platform never backfills weeks that already
 * happened. A test that pins the year to a fixed calendar date therefore
 * works only until the wall clock passes it — after that, week 1 is in the
 * past, is never generated, and every assertion about it fails for reasons
 * that have nothing to do with the code under test.
 *
 * Anchoring the window to "tomorrow" keeps every week ahead of now on
 * whatever day the suite happens to run.
 */
export function futureAcademicYearWindow(label = '2026–2027'): {
  label: string;
  startDate: string;
  endDate: string;
} {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 1);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 300);

  return { label, startDate: isoDate(start), endDate: isoDate(end) };
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
