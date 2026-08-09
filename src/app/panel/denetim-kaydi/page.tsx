import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canViewAuditLog } from '@/server/authz/policy';
import { AUDIT_ACTIONS, countAuditLogs, listAuditLogs, listDistinctAuditActors } from '@/server/services/audit';
import { listChapters } from '@/server/services/chapter-service';
import { listAcademicYears } from '@/server/services/academic-year';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { DEFAULT_TIMEZONE } from '@/lib/format';
import { auditActionLabels, messages } from '@/lib/i18n/tr';
import { zonedTimeToUtc } from '@/lib/timezone';
import { AuditLogRow } from './audit-log-row';

export const metadata: Metadata = {
  title: 'Denetim Kaydı',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTION_VALUES = new Set<string>(Object.values(AUDIT_ACTIONS));

type SearchParams = Record<string, string | string[] | undefined>;

function paramValue(params: SearchParams, key: string): string | undefined {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : undefined;
}

/** "YYYY-MM-DD" -> [year, month, day], or null if the string isn't that exact shape. Anything else in the URL is silently ignored rather than crashing the page. */
function parseDateParam(value: string | undefined): [number, number, number] | null {
  if (!value || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return [year, month, day];
}

/** Calendar-date-only increment (never on the zoned instant) — see the identical technique in `weekly-session-service.ts`. */
function nextCalendarDay([year, month, day]: [number, number, number]): [number, number, number] {
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()];
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const context = await requireAuthContext();
  if (!canViewAuditLog(context.scope)) redirect('/panel');

  const params = await searchParams;

  const actionRaw = paramValue(params, 'action');
  const action = actionRaw && ACTION_VALUES.has(actionRaw) ? actionRaw : undefined;

  const actorName = paramValue(params, 'actor');
  const chapterId = paramValue(params, 'chapterId');
  const academicYearId = paramValue(params, 'academicYearId');

  const fromRaw = paramValue(params, 'from');
  const toRaw = paramValue(params, 'to');
  const fromParts = parseDateParam(fromRaw);
  const toParts = parseDateParam(toRaw);
  const from = fromParts ? zonedTimeToUtc(fromParts[0], fromParts[1], fromParts[2], 0, 0, DEFAULT_TIMEZONE) : undefined;
  const to = toParts
    ? zonedTimeToUtc(...nextCalendarDay(toParts), 0, 0, DEFAULT_TIMEZONE)
    : undefined;

  const pageRaw = Number(paramValue(params, 'page'));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const filter = {
    action,
    actorName,
    chapterId,
    academicYearId,
    from,
    to,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };

  const [entries, total, actors, chapters, academicYears] = await Promise.all([
    listAuditLogs(filter),
    countAuditLogs(filter),
    listDistinctAuditActors(),
    listChapters(),
    listAcademicYears(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const basePageParams = new URLSearchParams();
  if (action) basePageParams.set('action', action);
  if (actorName) basePageParams.set('actor', actorName);
  if (chapterId) basePageParams.set('chapterId', chapterId);
  if (academicYearId) basePageParams.set('academicYearId', academicYearId);
  if (fromParts) basePageParams.set('from', fromRaw!);
  if (toParts) basePageParams.set('to', toRaw!);

  function hrefForPage(targetPage: number): string {
    const query = new URLSearchParams(basePageParams);
    if (targetPage > 1) query.set('page', String(targetPage));
    const queryString = query.toString();
    return queryString ? `/panel/denetim-kaydi?${queryString}` : '/panel/denetim-kaydi';
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Denetim Kaydı</h1>
        <p className="mt-1 text-sm text-navy-500">
          Hassas işlemlerin geçmişi. Yalnızca görüntülenir — bu sayfadan hiçbir kayıt değiştirilemez veya silinemez.
        </p>
      </div>

      <Card>
        <CardTitle>Filtreler</CardTitle>
        <form method="GET" className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="İşlem Türü" htmlFor="audit-filter-action">
            <Select id="audit-filter-action" name="action" defaultValue={action ?? ''}>
              <option value="">Tümü</option>
              {Object.values(AUDIT_ACTIONS).map((value) => (
                <option key={value} value={value}>
                  {auditActionLabels[value] ?? value}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Kim" htmlFor="audit-filter-actor">
            <Select id="audit-filter-actor" name="actor" defaultValue={actorName ?? ''}>
              <option value="">Tümü</option>
              {actors.map((actor) => (
                <option key={`${actor.actorUserId ?? 'null'}-${actor.actorName}`} value={actor.actorName}>
                  {actor.actorName}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Chapter" htmlFor="audit-filter-chapter">
            <Select id="audit-filter-chapter" name="chapterId" defaultValue={chapterId ?? ''}>
              <option value="">Tümü</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.code} — {chapter.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Akademik Yıl" htmlFor="audit-filter-year">
            <Select id="audit-filter-year" name="academicYearId" defaultValue={academicYearId ?? ''}>
              <option value="">Tümü</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Başlangıç Tarihi" htmlFor="audit-filter-from">
            <Input id="audit-filter-from" name="from" type="date" defaultValue={fromRaw ?? ''} />
          </Field>

          <Field label="Bitiş Tarihi" htmlFor="audit-filter-to">
            <Input id="audit-filter-to" name="to" type="date" defaultValue={toRaw ?? ''} />
          </Field>

          <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit" size="sm">
              Filtrele
            </Button>
            <Link href="/panel/denetim-kaydi" className="text-sm font-medium text-navy-600 hover:text-navy-800">
              Filtreleri Temizle
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Kayıtlar</CardTitle>
          <p className="text-sm text-navy-500">{total} kayıt</p>
        </div>

        {entries.length === 0 ? (
          <div className="mt-4">
            <EmptyState title={messages.empty.noAuditRecords} />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-navy-100">
            {entries.map((entry) => (
              <AuditLogRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-4">
            {page > 1 ? (
              <Link href={hrefForPage(page - 1)} className="text-sm font-medium text-navy-700 hover:text-navy-900">
                ← Önceki
              </Link>
            ) : (
              <span className="text-sm text-navy-300">← Önceki</span>
            )}
            <span className="text-sm text-navy-500">
              Sayfa {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={hrefForPage(page + 1)} className="text-sm font-medium text-navy-700 hover:text-navy-900">
                Sonraki →
              </Link>
            ) : (
              <span className="text-sm text-navy-300">Sonraki →</span>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
