import { describeAuditEntry } from '@/lib/audit-log-format';
import { formatDateTimeTr } from '@/lib/format';
import type { AuditLogEntry } from '@/server/services/audit';

/**
 * Read-only. No edit/delete control belongs on this row — the audit trail is
 * append-only and this page must never be a way to alter it.
 */
export function AuditLogRow({ entry }: { entry: AuditLogEntry }) {
  const description = describeAuditEntry({
    actorName: entry.actorName,
    action: entry.action,
    targetLabel: entry.targetLabel,
    chapterName: entry.chapterName,
  });

  const hasDetail = entry.beforeData !== null || entry.afterData !== null;

  return (
    <li className="py-3">
      <p className="text-xs text-ink-3">{formatDateTimeTr(entry.createdAt)}</p>
      <p className="mt-0.5 text-sm text-ink">{description}</p>
      {entry.academicYearLabel ? <p className="mt-0.5 text-xs text-ink-3">{entry.academicYearLabel}</p> : null}
      {hasDetail ? (
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-xs font-medium text-ink-3 hover:text-ink-2">
            Değişiklik Detayı
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {entry.beforeData ? (
              <div>
                <p className="text-xs font-medium text-ink-3">Önce</p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs text-ink-2">
                  {JSON.stringify(entry.beforeData, null, 2)}
                </pre>
              </div>
            ) : null}
            {entry.afterData ? (
              <div>
                <p className="text-xs font-medium text-ink-3">Sonra</p>
                <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs text-ink-2">
                  {JSON.stringify(entry.afterData, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </li>
  );
}
