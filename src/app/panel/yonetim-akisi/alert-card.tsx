import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { alertCategoryLabels, alertStatusLabels } from '@/lib/i18n/tr';
import { formatRelativeTr } from '@/lib/format';
import { AlertStatusControls } from './alert-status-controls';
import type { ManagementAlert } from '@/server/services/alert-query';

/**
 * Urgency is carried by the card's own edge, not by a pill.
 *
 * A list of ten alerts was ten identical dark rectangles: the only signal was
 * a small badge that also doubled as the category, so "how urgent" and "what
 * kind" were fighting for the same spot and neither was readable at a glance.
 * The edge answers "which of these first?" before you read a word; the badge
 * is left to say what the thing actually is.
 */
const SEVERITY_EDGE: Record<string, string> = {
  red: 'border-l-danger',
  yellow: 'border-l-warn',
  info: 'border-l-info',
};

/** Written out, not interpolated: Tailwind only emits classes it can see
    in the source, so `text-${tone}` would produce no colour at all. */
const SEVERITY_TEXT: Record<string, string> = {
  red: 'text-danger',
  yellow: 'text-warn',
  info: 'text-info',
};

const SEVERITY_LABEL: Record<string, string> = {
  red: 'Acil',
  yellow: 'Takip',
  info: 'Bilgi',
};

export function AlertCard({
  alert,
  linkHref,
  canManage,
}: {
  alert: ManagementAlert;
  linkHref: string | null;
  canManage: boolean;
}) {
  return (
    <Card className={`border-l-4 ${SEVERITY_EDGE[alert.severity] ?? 'border-l-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Colour never carries the meaning on its own — the edge is
                repeated here in words for anyone who cannot use it. */}
            <span
              className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SEVERITY_TEXT[alert.severity] ?? 'text-ink-3'}`}
            >
              {SEVERITY_LABEL[alert.severity] ?? ''}
            </span>
            <StatusPill tone="neutral">{alertCategoryLabels[alert.category]}</StatusPill>
            {alert.status === 'investigating' ? <StatusPill tone="info">{alertStatusLabels.investigating}</StatusPill> : null}
          </div>
          <p className="mt-2 font-medium text-ink">{alert.title}</p>
          <p className="mt-1 text-sm text-ink-2">{alert.detail}</p>
          <p className="mt-1 text-xs text-ink-3">
            Tespit: {formatRelativeTr(alert.firstDetectedAt)}
            {alert.assignedRoleLabel ? ` · Sorumlu: ${alert.assignedRoleLabel}` : ''}
          </p>
        </div>
        {linkHref ? (
          <Link href={linkHref} className="text-sm text-ink-3 hover:text-ink-2">
            Görüntüle →
          </Link>
        ) : null}
      </div>
      {canManage ? <AlertStatusControls alertId={alert.id} status={alert.status} /> : null}
    </Card>
  );
}
