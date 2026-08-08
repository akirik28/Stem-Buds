import { describe, expect, it } from 'vitest';
import { pickCurrentSession } from '@/server/domain/session-picker';

describe('pickCurrentSession', () => {
  const at = (iso: string) => new Date(iso);

  it('returns null for an empty list', () => {
    expect(pickCurrentSession([], at('2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('picks the nearest upcoming session', () => {
    const sessions = [
      { weekNumber: 1, scheduledStartAt: at('2026-01-05T00:00:00Z') },
      { weekNumber: 2, scheduledStartAt: at('2026-01-12T00:00:00Z') },
      { weekNumber: 3, scheduledStartAt: at('2026-01-19T00:00:00Z') },
    ];
    const picked = pickCurrentSession(sessions, at('2026-01-08T00:00:00Z'));
    expect(picked?.weekNumber).toBe(2);
  });

  it('treats a session starting exactly now as upcoming', () => {
    const sessions = [{ weekNumber: 1, scheduledStartAt: at('2026-01-05T18:00:00Z') }];
    const picked = pickCurrentSession(sessions, at('2026-01-05T18:00:00Z'));
    expect(picked?.weekNumber).toBe(1);
  });

  it('falls back to the most recent past session once everything is over', () => {
    const sessions = [
      { weekNumber: 1, scheduledStartAt: at('2026-01-05T00:00:00Z') },
      { weekNumber: 2, scheduledStartAt: at('2026-01-12T00:00:00Z') },
    ];
    const picked = pickCurrentSession(sessions, at('2026-06-01T00:00:00Z'));
    expect(picked?.weekNumber).toBe(2);
  });

  it('is order-independent regardless of input ordering', () => {
    const sessions = [
      { weekNumber: 3, scheduledStartAt: at('2026-01-19T00:00:00Z') },
      { weekNumber: 1, scheduledStartAt: at('2026-01-05T00:00:00Z') },
      { weekNumber: 2, scheduledStartAt: at('2026-01-12T00:00:00Z') },
    ];
    const picked = pickCurrentSession(sessions, at('2026-01-08T00:00:00Z'));
    expect(picked?.weekNumber).toBe(2);
  });
});
