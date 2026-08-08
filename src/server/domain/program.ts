/**
 * Stable program identifiers the application code refers to.
 *
 * These are not a Postgres enum: `programs` is a real table (see
 * `src/server/db/schema/programs.ts`) because a program carries editable
 * Turkish labels and independent settings, not just a fixed code. `PROGRAM_KEYS`
 * is what lets code say "the Online Ortaokul Programı" without hard-coding a
 * UUID or a Turkish string comparison.
 */
export const PROGRAM_KEYS = {
  onlineMiddleSchool: 'online_middle_school',
  bilsem: 'bilsem',
} as const;

export type ProgramKey = (typeof PROGRAM_KEYS)[keyof typeof PROGRAM_KEYS];

/**
 * The two programs' seed definitions.
 *
 * Only `key`, `name`, `shortName` and `description` are set here — everything
 * about *how* a program actually runs (schedule, cycle length, delivery mode,
 * alert thresholds) lives in that program's `programSettings` row and starts
 * unconfigured. The BİLSEM Programı in particular must not inherit the Online
 * Ortaokul Programı's 10-week/weekly-Zoom shape just because it is seeded
 * alongside it.
 */
export const PROGRAM_SEEDS: ReadonlyArray<{
  key: ProgramKey;
  name: string;
  shortName: string;
  description: string;
}> = [
  {
    key: PROGRAM_KEYS.onlineMiddleSchool,
    name: 'Online Ortaokul Programı',
    shortName: 'Online Ortaokul',
    description:
      'Ortaokul öğrencilerini lise öğrencisi mentorlarla buluşturan, tamamen çevrimiçi, haftalık tek oturumluk mentorluk ve proje programı.',
  },
  {
    key: PROGRAM_KEYS.bilsem,
    name: 'BİLSEM Programı',
    shortName: 'BİLSEM',
    description: 'BİLSEM iş birliği kapsamında yürütülen, final konferansıyla sonuçlanan program.',
  },
] as const;

/** UI label for the "no program filter" state in the executive switcher. */
export const ALL_PROGRAMS_LABEL = 'Tüm Programlar';
