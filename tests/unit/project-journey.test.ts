import { describe, expect, it } from 'vitest';
import { buildProjectJourney, type JourneySessionInput } from '@/server/domain/project-journey';

describe('buildProjectJourney', () => {
  const at = (iso: string) => new Date(iso);

  const session = (overrides: Partial<JourneySessionInput> = {}): JourneySessionInput => ({
    weekNumber: 1,
    scheduledStartAt: at('2026-09-05T18:00:00Z'),
    whatWeDid: 'Konu belirlendi',
    outputs: null,
    problems: null,
    nextWeekGoal: null,
    completedAt: at('2026-09-05T19:00:00Z'),
    authorName: null,
    ...overrides,
  });

  it('skips sessions that were never finalized', () => {
    const journey = buildProjectJourney([session({ completedAt: null })], []);
    expect(journey).toEqual([]);
  });

  it('prefers outputs over whatWeDid when both exist', () => {
    const journey = buildProjectJourney(
      [session({ whatWeDid: 'Konu araştırması yaptık', outputs: 'Konu belirlendi' })],
      [],
    );
    expect(journey[0]).toMatchObject({ type: 'session', weekNumber: 1, label: 'Konu belirlendi' });
  });

  it('falls back to whatWeDid when outputs is empty', () => {
    const journey = buildProjectJourney(
      [session({ whatWeDid: 'Konu araştırması yaptık', outputs: '   ' })],
      [],
    );
    expect(journey[0]?.label).toBe('Konu araştırması yaptık');
  });

  it('carries the blocker, next step and author alongside the week’s label', () => {
    const journey = buildProjectJourney(
      [
        session({
          problems: 'Yeterli veri elde edilemiyor.',
          nextWeekGoal: 'Daha fazla örnek toplamak.',
          authorName: 'Mentor A',
        }),
      ],
      [],
    );
    expect(journey[0]).toMatchObject({
      problem: 'Yeterli veri elde edilemiyor.',
      nextStep: 'Daha fazla örnek toplamak.',
      authorName: 'Mentor A',
    });
  });

  it('reports no blocker/next step as null rather than an empty string', () => {
    const journey = buildProjectJourney([session({ problems: '  ', nextWeekGoal: null })], []);
    expect(journey[0]).toMatchObject({ problem: null, nextStep: null });
  });

  it('excludes milestones that are not yet completed', () => {
    const journey = buildProjectJourney([], [{ title: 'Prototip', completedAt: null }]);
    expect(journey).toEqual([]);
  });

  it('interleaves sessions and milestones in chronological order', () => {
    const journey = buildProjectJourney(
      [
        session({ weekNumber: 1, scheduledStartAt: at('2026-09-05T18:00:00Z'), completedAt: at('2026-09-05T19:00:00Z'), whatWeDid: 'Konu belirlendi' }),
        session({ weekNumber: 3, scheduledStartAt: at('2026-09-19T18:00:00Z'), completedAt: at('2026-09-19T19:00:00Z'), whatWeDid: 'Deney tasarlandı' }),
      ],
      [{ title: 'İlk prototip tamamlandı', completedAt: at('2026-09-12T12:00:00Z') }],
    );
    expect(journey.map((entry) => entry.label)).toEqual([
      'Konu belirlendi',
      'İlk prototip tamamlandı',
      'Deney tasarlandı',
    ]);
  });
});
