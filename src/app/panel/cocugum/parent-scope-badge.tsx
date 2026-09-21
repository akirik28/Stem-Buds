import { StatusPill } from '@/components/ui/status';

/**
 * Present on every parent screen.
 *
 * A parent sees a slice of a shared system, and the boundary should never be
 * something they have to infer from what happens to be missing — it is
 * stated. `info` + dashed, the same register the product uses for "this is
 * context, not a problem".
 */
export function ParentScopeBadge({ childName }: { childName?: string }) {
  return (
    <StatusPill tone="info" icon="◇" dashed>
      Salt okunur · yalnızca {childName ? childName.split(' ')[0] : 'çocuğunuz'}
    </StatusPill>
  );
}

/** Explains, once per screen, why no other student is named here. */
export function ParentPrivacyNote({ studentCount }: { studentCount: number }) {
  return (
    <p className="text-[12px]/[1.6] text-ink-3">
      Bu grupta {studentCount} öğrenci var · diğer öğrencilerin isimleri ve kayıtları
      paylaşılmaz.
    </p>
  );
}
