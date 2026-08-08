import { describe, expect, it } from 'vitest';
import { zonedTimeToUtc } from '@/lib/timezone';

describe('zonedTimeToUtc', () => {
  it('converts an Europe/Istanbul wall-clock time to the correct UTC instant (UTC+3)', () => {
    // Saturday 18:00 in Istanbul is 15:00 UTC.
    const result = zonedTimeToUtc(2026, 11, 21, 18, 0, 'Europe/Istanbul');
    expect(result.toISOString()).toBe('2026-11-21T15:00:00.000Z');
  });

  it('handles a DST-observing timezone correctly on both sides of the transition', () => {
    // America/New_York: EST (UTC-5) in January, EDT (UTC-4) in July.
    const winter = zonedTimeToUtc(2026, 1, 15, 18, 0, 'America/New_York');
    expect(winter.toISOString()).toBe('2026-01-15T23:00:00.000Z');

    const summer = zonedTimeToUtc(2026, 7, 15, 18, 0, 'America/New_York');
    expect(summer.toISOString()).toBe('2026-07-15T22:00:00.000Z');
  });

  it('round-trips through the local calendar date correctly near midnight', () => {
    const result = zonedTimeToUtc(2026, 3, 1, 0, 30, 'Europe/Istanbul');
    expect(result.toISOString()).toBe('2026-02-28T21:30:00.000Z');
  });
});
