import { describe, expect, it } from 'vitest';
import { buildProjectJourney } from '@/server/domain/project-journey';

describe('buildProjectJourney', () => {
  const at = (iso: string) => new Date(iso);

  it('skips sessions that were never finalized', () => {
    const journey = buildProjectJourney(
      [
        {
          weekNumber: 1,
          scheduledStartAt: at('2026-09-05T18:00:00Z'),
          whatWeDid: 'Konu belirlendi',
          outputs: null,
          completedAt: null,
        },
      ],
      [],
    );
    expect(journey).toEqual([]);
  });

  it('prefers outputs over whatWeDid when both exist', () => {
    const journey = buildProjectJourney(
      [
        {
          weekNumber: 1,
          scheduledStartAt: at('2026-09-05T18:00:00Z'),
          whatWeDid: 'Konu araştırması yaptık',
          outputs: 'Konu belirlendi',
          completedAt: at('2026-09-05T19:30:00Z'),
        },
      ],
      [],
    );
    expect(journey).toEqual([
      { type: 'session', date: at('2026-09-05T18:00:00Z'), weekNumber: 1, label: 'Konu belirlendi' },
    ]);
  });

  it('falls back to whatWeDid when outputs is empty', () => {
    const journey = buildProjectJourney(
      [
        {
          weekNumber: 1,
          scheduledStartAt: at('2026-09-05T18:00:00Z'),
          whatWeDid: 'Konu araştırması yaptık',
          outputs: '   ',
          completedAt: at('2026-09-05T19:30:00Z'),
        },
      ],
      [],
    );
    expect(journey[0]?.label).toBe('Konu araştırması yaptık');
  });

  it('excludes milestones that are not yet completed', () => {
    const journey = buildProjectJourney([], [{ title: 'Prototip', completedAt: null }]);
    expect(journey).toEqual([]);
  });

  it('interleaves sessions and milestones in chronological order', () => {
    const journey = buildProjectJourney(
      [
        {
          weekNumber: 1,
          scheduledStartAt: at('2026-09-05T18:00:00Z'),
          whatWeDid: 'Konu belirlendi',
          outputs: null,
          completedAt: at('2026-09-05T19:00:00Z'),
        },
        {
          weekNumber: 3,
          scheduledStartAt: at('2026-09-19T18:00:00Z'),
          whatWeDid: 'Deney tasarlandı',
          outputs: null,
          completedAt: at('2026-09-19T19:00:00Z'),
        },
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
