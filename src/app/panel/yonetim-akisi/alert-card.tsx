import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { StatusPill, alertSeverityTones } from '@/components/ui/status';
import { alertCategoryLabels, alertStatusLabels } from '@/lib/i18n/tr';
import { formatRelativeTr } from '@/lib/format';
import { AlertStatusControls } from './alert-status-controls';
import type { ManagementAlert } from '@/server/services/alert-query';

const SEVERITY_ICON: Record<string, string> = { red: '🔴', yellow: '🟡', info: 'ℹ️' };

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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={alertSeverityTones[alert.severity]} icon={SEVERITY_ICON[alert.severity]}>
              {alertCategoryLabels[alert.category]}
            </StatusPill>
            {alert.status === 'investigating' ? <StatusPill tone="info">{alertStatusLabels.investigating}</StatusPill> : null}
          </div>
          <p className="mt-2 font-medium text-navy-900">{alert.title}</p>
          <p className="mt-1 text-sm text-navy-600">{alert.detail}</p>
          <p className="mt-1 text-xs text-navy-400">
            Tespit: {formatRelativeTr(alert.firstDetectedAt)}
            {alert.assignedRoleLabel ? ` · Sorumlu: ${alert.assignedRoleLabel}` : ''}
          </p>
        </div>
        {linkHref ? (
          <Link href={linkHref} className="text-sm text-navy-500 hover:text-navy-700">
            Görüntüle →
          </Link>
        ) : null}
      </div>
      {canManage ? <AlertStatusControls alertId={alert.id} status={alert.status} /> : null}
    </Card>
  );
}
