/**
 * IANA-timezone-aware wall-clock ↔ UTC conversion, dependency-free.
 *
 * Used to turn a program's configured weekly slot ("Cumartesi 18:00,
 * Europe/Istanbul") into the correct UTC instant for every week of an
 * academic year, including across a DST transition in timezones that
 * observe one (Europe/Istanbul itself has used a fixed UTC+3 offset since
 * 2016, but the algorithm does not assume that — it re-derives the offset
 * for every date it converts).
 */

/**
 * Returns the UTC instant that displays as the given wall-clock date/time
 * when rendered in `timeZone`.
 */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  // Treat the wall-clock values as if they were already UTC — a first guess
  // that is off by exactly the timezone's offset at that instant.
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMs = timezoneOffsetMsAt(new Date(guessUtcMs), timeZone);
  return new Date(guessUtcMs - offsetMs);
}

/**
 * How far `timeZone`'s local time is ahead of UTC at the instant `date`,
 * in milliseconds (positive east of UTC, matching Europe/Istanbul's +3h).
 */
function timezoneOffsetMsAt(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }

  const asIfUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  return asIfUtcMs - date.getTime();
}

/** `Date` -> "YYYY-MM-DD" using UTC fields (matches how `date` columns round-trip). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
