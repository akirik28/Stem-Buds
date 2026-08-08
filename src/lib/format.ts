/**
 * Turkish presentation helpers.
 *
 * Timestamps are stored canonically in UTC (`timestamptz`) and formatted for
 * display in the program timezone, which defaults to Europe/Istanbul.
 */

export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

const dateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  });

const dateTimeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });

const shortDateFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone,
  });

const timeFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone });

const weekdayFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone });

/** "8 Ağustos 2026" */
export function formatDateTr(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return dateFormatter(timeZone).format(toDate(value));
}

/** "8 Ağustos 2026, 14:21" — Intl already produces the Turkish comma form. */
export function formatDateTimeTr(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return dateTimeFormatter(timeZone).format(toDate(value));
}

/** "08.08.2026" */
export function formatShortDateTr(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return shortDateFormatter(timeZone).format(toDate(value));
}

/** "14:21" */
export function formatTimeTr(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return timeFormatter(timeZone).format(toDate(value));
}

/** "Cumartesi" */
export function formatWeekdayTr(value: Date | string, timeZone = DEFAULT_TIMEZONE): string {
  return weekdayFormatter(timeZone).format(toDate(value));
}

/** "%88" — Turkish writes the percent sign before the number. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `%${Math.round(value)}`;
}

/** "3 saat önce", "2 gün önce" */
export function formatRelativeTr(value: Date | string, now: Date = new Date()): string {
  const target = toDate(value);
  const diffMs = now.getTime() - target.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  const minutes = Math.floor(abs / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return future ? `${minutes} dakika sonra` : `${minutes} dakika önce`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return future ? `${hours} saat sonra` : `${hours} saat önce`;

  const days = Math.floor(hours / 24);
  if (days < 30) return future ? `${days} gün sonra` : `${days} gün önce`;

  const months = Math.floor(days / 30);
  if (months < 12) return future ? `${months} ay sonra` : `${months} ay önce`;

  const years = Math.floor(months / 12);
  return future ? `${years} yıl sonra` : `${years} yıl önce`;
}

/** "18:00–19:00" for a session slot. */
export function formatTimeRangeTr(
  start: Date | string,
  end: Date | string,
  timeZone = DEFAULT_TIMEZONE,
): string {
  return `${formatTimeTr(start, timeZone)}–${formatTimeTr(end, timeZone)}`;
}

/** Minutes after midnight -> "18:30". */
export function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** "18:30" -> 1110. Returns null for anything unparsable. */
export function parseMinuteOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}
