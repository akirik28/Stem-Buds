import { describe, expect, it } from 'vitest';
import { isoWeekKey } from '@/server/domain/iso-week';

describe('isoWeekKey', () => {
  it('computes a mid-year week correctly', () => {
    expect(isoWeekKey(new Date('2026-08-08T12:00:00Z'))).toBe('2026-W32');
  });

  it('handles the year-boundary edge case (late Dec belonging to week 1 of next year)', () => {
    expect(isoWeekKey(new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01');
  });

  it('handles early January belonging to the last week of the previous year', () => {
    expect(isoWeekKey(new Date('2027-01-01T00:00:00Z'))).toBe('2026-W53');
  });
});
