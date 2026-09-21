import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuthContext } from '@/server/auth/context';
import { canViewChapter, isExecutive } from '@/server/authz/policy';
import { listChapters } from '@/server/services/chapter-service';
import { listPrograms } from '@/server/services/program-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { ALL_PROGRAMS_LABEL } from '@/server/domain/program';
import { CreateChapterForm } from './create-chapter-form';

export const metadata: Metadata = {
  title: 'Gruplar',
  robots: { index: false, follow: false },
};

export default async function ChaptersPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const context = await requireAuthContext();
  const { program: programFilter } = await searchParams;

  const [allChapters, programs] = await Promise.all([
    listChapters(programFilter ? { programId: programFilter } : {}),
    listPrograms(),
  ]);

  const visibleChapters = allChapters.filter((chapter) => canViewChapter(context.scope, chapter.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Gruplar</h1>
        <p className="mt-1 text-sm text-ink-3">Chapter seçerek gruplarını görüntüleyin.</p>
      </div>

      <nav aria-label="Program filtresi" className="flex flex-wrap gap-2">
        <ProgramFilterLink label={ALL_PROGRAMS_LABEL} active={!programFilter} href="/panel/gruplar" />
        {programs.map((program) => (
          <ProgramFilterLink
            key={program.id}
            label={program.shortName}
            active={programFilter === program.id}
            href={`/panel/gruplar?program=${program.id}`}
          />
        ))}
      </nav>

      {isExecutive(context.scope.role) ? (
        <Card>
          <CardTitle>Yeni chapter oluştur</CardTitle>
          <CreateChapterForm programs={programs.map((p) => ({ id: p.id, label: p.name }))} />
        </Card>
      ) : null}

      {visibleChapters.length === 0 ? (
        <EmptyState title="Henüz grup oluşturulmadı." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleChapters.map((chapter) => {
            const program = programs.find((p) => p.id === chapter.programId);
            return (
              <Link key={chapter.id} href={`/panel/gruplar/${chapter.id}`}>
                <Card className="h-full transition-colors hover:ring-line">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{chapter.name}</p>
                      <p className="text-sm text-ink-3">{chapter.code}</p>
                    </div>
                    {!chapter.isActive ? <StatusPill tone="neutral">Pasif</StatusPill> : null}
                  </div>
                  {program ? (
                    <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-3">
                      {program.shortName}
                    </p>
                  ) : null}
                  {chapter.city ? <p className="mt-1 text-sm text-ink-3">{chapter.city}</p> : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgramFilterLink({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'inline-flex min-h-9 items-center rounded-full bg-surface-3 px-3.5 text-sm font-medium text-ink'
          : 'inline-flex min-h-9 items-center rounded-full bg-surface px-3.5 text-sm font-medium text-ink-2 ring-1 ring-line hover:bg-surface-2'
      }
    >
      {label}
    </Link>
  );
}
