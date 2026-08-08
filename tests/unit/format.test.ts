import { describe, expect, it } from 'vitest';
import {
  formatDateTr,
  formatMinuteOfDay,
  formatPercent,
  formatRelativeTr,
  formatTimeRangeTr,
  formatWeekdayTr,
  parseMinuteOfDay,
} from '@/lib/format';

describe('Turkish date formatting', () => {
  const sample = new Date('2026-08-08T11:21:00.000Z'); // 14:21 in Europe/Istanbul

  it('formats a date in Turkish', () => {
    expect(formatDateTr(sample)).toBe('8 Ağustos 2026');
  });

  it('formats the weekday in Turkish', () => {
    expect(formatWeekdayTr(sample)).toBe('Cumartesi');
  });

  it('renders a session slot as a range', () => {
    const start = new Date('2026-11-18T15:00:00.000Z'); // 18:00 local
    const end = new Date('2026-11-18T16:00:00.000Z');
    expect(formatTimeRangeTr(start, end)).toBe('18:00–19:00');
  });
});

describe('percentages', () => {
  it('puts the percent sign before the number', () => {
    expect(formatPercent(88)).toBe('%88');
    expect(formatPercent(87.6)).toBe('%88');
  });

  it('shows a dash when there is no value', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
  });
});

describe('relative time', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');

  it('describes the past in Turkish', () => {
    expect(formatRelativeTr(new Date('2026-08-08T09:00:00.000Z'), now)).toBe('3 saat önce');
    expect(formatRelativeTr(new Date('2026-08-05T12:00:00.000Z'), now)).toBe('3 gün önce');
  });

  it('describes the future in Turkish', () => {
    expect(formatRelativeTr(new Date('2026-08-08T14:00:00.000Z'), now)).toBe('2 saat sonra');
  });
});

describe('minute of day', () => {
  it('round-trips a time value', () => {
    expect(parseMinuteOfDay('18:30')).toBe(1110);
    expect(formatMinuteOfDay(1110)).toBe('18:30');
    expect(formatMinuteOfDay(540)).toBe('09:00');
  });

  it('rejects malformed input', () => {
    expect(parseMinuteOfDay('25:00')).toBeNull();
    expect(parseMinuteOfDay('18:60')).toBeNull();
    expect(parseMinuteOfDay('abc')).toBeNull();
  });
});
