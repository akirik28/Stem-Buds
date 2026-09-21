import * as React from 'react';
import { cn } from '@/lib/utils';
import { attendanceIcons, homeworkStatusIcons, projectHealthIcons } from '@/lib/i18n/tr';

export type StatusTone = 'ok' | 'warn' | 'danger' | 'info' | 'ai' | 'neutral';

const toneClasses: Record<StatusTone, string> = {
  ok: 'bg-ok-soft text-ok ring-ok-line',
  warn: 'bg-warn-soft text-warn ring-warn-line',
  danger: 'bg-danger-soft text-danger ring-danger-line',
  info: 'bg-info-soft text-info ring-info-line',
  ai: 'bg-ai-soft text-ai ring-ai-line',
  neutral: 'bg-surface-2 text-ink-2 ring-line',
};

export type StatusPillProps = {
  tone: StatusTone;
  /** Decorative marker; the label alone must already carry the meaning. */
  icon?: string;
  /**
   * A dashed ring. Reserved for the "not counted against you" states —
   * excused attendance/homework and a milestone that is only planned — so
   * they read differently from a solid, decided state even in greyscale.
   */
  dashed?: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * A status chip.
 *
 * Colour is never the only signal: every pill also carries a glyph and its
 * Turkish wording, so the state survives greyscale, colour blindness and a
 * screen reader.
 */
export function StatusPill({ tone, icon, dashed, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset',
        toneClasses[tone],
        dashed && 'border border-dashed border-current bg-transparent ring-0',
        className,
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </span>
  );
}

/*
 * Tone and glyph per domain state.
 *
 * `excused` is deliberately `info`, not `warn`: an excused absence is an
 * agreed, non-punitive state and must never be rendered in the same register
 * as an unexplained one. Same for excused homework. This is the single
 * easiest thing to get wrong here — do not "simplify" it back into `warn`.
 */

export const attendanceTones = {
  present: 'ok',
  late: 'warn',
  absent: 'danger',
  excused: 'info',
} as const satisfies Record<string, StatusTone>;

/** Re-exported from the i18n catalogue so the glyphs live in exactly one place. */
export const attendanceGlyphs = attendanceIcons;

export const homeworkTones = {
  pending: 'neutral',
  done: 'ok',
  not_done: 'danger',
  excused: 'info',
} as const satisfies Record<string, StatusTone>;

/** Re-exported from the i18n catalogue so the glyphs live in exactly one place. */
export const homeworkGlyphs = homeworkStatusIcons;

export const projectHealthTones = {
  on_track: 'ok',
  attention: 'warn',
  delayed: 'danger',
} as const satisfies Record<string, StatusTone>;

/** Re-exported from the i18n catalogue so the glyphs live in exactly one place. */
export const projectHealthGlyphs = projectHealthIcons;

export const milestoneTones = {
  planned: 'neutral',
  in_progress: 'info',
  completed: 'ok',
} as const satisfies Record<string, StatusTone>;

export const milestoneGlyphs = {
  planned: '○',
  in_progress: '◐',
  completed: '✓',
} as const;

export const weeklySessionStateTones = {
  scheduled: 'neutral',
  cancelled: 'danger',
  holiday: 'info',
} as const satisfies Record<string, StatusTone>;

export const weeklySessionStateGlyphs = {
  scheduled: '◷',
  cancelled: '✕',
  holiday: '⌂',
} as const;

export const alertSeverityTones = {
  info: 'info',
  yellow: 'warn',
  red: 'danger',
} as const satisfies Record<string, StatusTone>;

export const alertSeverityGlyphs = {
  info: '●',
  yellow: '△',
  red: '▲',
} as const;

/**
 * Severity also reads as a three-step meter, so the difference between
 * "Dikkat" and "Aksiyon gerekiyor" survives without colour: ▮▯▯ / ▮▮▯ / ▮▮▮.
 */
export const alertSeverityMeters = {
  info: '▮▯▯',
  yellow: '▮▮▯',
  red: '▮▮▮',
} as const;

/** Dashed states: agreed-but-not-done, never a failure. */
export const dashedAttendance = new Set(['excused']);
export const dashedHomework = new Set(['excused']);
export const dashedMilestone = new Set(['planned']);

/** Meeting confidentiality: chapter scope vs. management-only. */
export const confidentialScopeTones = {
  chapter: 'info',
  executive: 'ai',
} as const satisfies Record<string, StatusTone>;

export const confidentialScopeGlyphs = {
  chapter: '◇',
  executive: '🔒',
} as const;
