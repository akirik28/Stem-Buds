import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuthContext } from '@/server/auth/context';
import { canViewChapter, canViewGroup } from '@/server/authz/policy';
import { listChapters } from '@/server/services/chapter-service';
import { listGroupsByChapter } from '@/server/services/group-service';
import { getProjectByGroupId } from '@/server/services/project-service';
import { listPrograms } from '@/server/services/program-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill, projectHealthTones } from '@/components/ui/status';
import { ALL_PROGRAMS_LABEL } from '@/server/domain/program';
import { messages, projectHealthIcons, projectHealthLabels } from '@/lib/i18n/tr';

export const metadata: Metadata = {
  title: 'Projeler',
  robots: { index: false, follow: false },
};

export default async function ProjectsPage({
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

  const chapterSections = context.academicYearId
    ? await Promise.all(
        visibleChapters.map(async (chapter) => {
          const groups = await listGroupsByChapter(chapter.id, context.academicYearId!);
          const visibleGroups = groups.filter((group) => canViewGroup(context.scope, group.id, chapter.id));
          const groupsWithProjects = await Promise.all(
            visibleGroups.map(async (group) => ({
              group,
              project: await getProjectByGroupId(group.id, context.academicYearId!),
            })),
          );
          return { chapter, groupsWithProjects };
        }),
      )
    : [];

  const hasAnyGroup = chapterSections.some((section) => section.groupsWithProjects.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Projeler</h1>
        <p className="mt-1 text-sm text-navy-500">Erişebildiğiniz grupların projeleri ve durumları.</p>
      </div>

      <nav aria-label="Program filtresi" className="flex flex-wrap gap-2">
        <ProgramFilterLink label={ALL_PROGRAMS_LABEL} active={!programFilter} href="/panel/projeler" />
        {programs.map((program) => (
          <ProgramFilterLink
            key={program.id}
            label={program.shortName}
            active={programFilter === program.id}
            href={`/panel/projeler?program=${program.id}`}
          />
        ))}
      </nav>

      {!hasAnyGroup ? (
        <EmptyState title={messages.empty.noProjects} />
      ) : (
        chapterSections
          .filter((section) => section.groupsWithProjects.length > 0)
          .map(({ chapter, groupsWithProjects }) => (
            <Card key={chapter.id}>
              <CardTitle>{chapter.name}</CardTitle>
              <ul className="mt-3 divide-y divide-navy-100">
                {groupsWithProjects.map(({ group, project }) => (
                  <li key={group.id} className="py-2.5">
                    <Link
                      href={`/panel/gruplar/${chapter.id}/${group.id}/proje`}
                      className="flex items-center justify-between gap-3 text-sm hover:text-navy-900"
                    >
                      <span className="text-navy-700">
                        {project ? project.name : group.name}
                        <span className="ml-2 text-navy-400">({group.name})</span>
                      </span>
                      {project ? (
                        <StatusPill tone={projectHealthTones[project.health]} icon={projectHealthIcons[project.health]}>
                          {projectHealthLabels[project.health]}
                        </StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Proje oluşturulmadı</StatusPill>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))
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
          ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
          : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
      }
    >
      {label}
    </Link>
  );
}
