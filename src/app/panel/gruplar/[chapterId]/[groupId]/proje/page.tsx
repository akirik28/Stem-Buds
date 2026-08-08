import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import {
  canDeleteMilestone,
  canEditWeeklyNarrative,
  canManageProject,
  canViewGroup,
  type AccessScope,
} from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { getGroupById } from '@/server/services/group-service';
import { getUserById } from '@/server/services/user-admin';
import {
  getProjectByGroupId,
  getProjectJourney,
  listMilestonesByProject,
  type Project,
} from '@/server/services/project-service';
import { listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { pickCurrentSession } from '@/server/domain/session-picker';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { projectHealthTones } from '@/components/ui/status';
import { formatShortDateTr } from '@/lib/format';
import { messages, projectHealthIcons, projectHealthLabels } from '@/lib/i18n/tr';
import { CreateProjectForm } from './create-project-form';
import { ProjectDetailsForm } from './project-details-form';
import { ProjectStatusForm } from './project-status-form';
import { OutcomeForm } from './outcome-form';
import { AddMilestoneForm } from './add-milestone-form';
import { MilestoneRow } from './milestone-row';

export const metadata: Metadata = {
  title: 'Proje',
  robots: { index: false, follow: false },
};

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ chapterId: string; groupId: string }>;
}) {
  const { chapterId, groupId } = await params;
  const context = await requireAuthContext();

  const [chapter, group] = await Promise.all([getChapterById(chapterId), getGroupById(groupId)]);
  if (!chapter || !group || group.chapterId !== chapter.id) notFound();
  if (!canViewGroup(context.scope, group.id, chapter.id)) redirect('/panel/gruplar');

  const canManage = canManageProject(context.scope, group.id, chapter.id);
  const canEditNarrative = canEditWeeklyNarrative(context.scope, group.id, chapter.id);
  const project = context.academicYearId
    ? await getProjectByGroupId(group.id, context.academicYearId)
    : null;

  const sessions = await listWeeklySessionsByGroup(group.id);
  const currentSession = pickCurrentSession(sessions, new Date());
  const mentor = group.mentorUserId ? await getUserById(group.mentorUserId) : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/panel/gruplar/${chapter.id}/${group.id}`}
          className="text-sm text-navy-500 hover:text-navy-700"
        >
          ← {group.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-navy-900">
            {project ? project.name : `${group.name} — Proje`}
          </h1>
          {currentSession ? (
            <Link
              href={`/panel/gruplar/${chapter.id}/${group.id}/oturumlar/${currentSession.id}`}
              className={
                canEditNarrative
                  ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white hover:bg-navy-700'
                  : 'text-sm text-navy-500 hover:text-navy-700'
              }
            >
              {canEditNarrative
                ? `${currentSession.weekNumber}. haftanın ilerlemesini gir →`
                : `${currentSession.weekNumber}. hafta oturumuna git →`}
            </Link>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-navy-500">
          {chapter.name} · {group.name}
          {mentor ? ` · Mentor: ${mentor.fullName}` : ''}
        </p>
      </div>

      {!project ? (
        <Card>
          {canManage ? (
            <>
              <CardTitle>Proje oluştur</CardTitle>
              <CreateProjectForm chapterId={chapter.id} groupId={group.id} />
            </>
          ) : (
            <EmptyState title={messages.empty.noProjects} />
          )}
        </Card>
      ) : (
        <ProjectContent
          chapterId={chapter.id}
          groupId={group.id}
          project={project}
          canManage={canManage}
          scope={context.scope}
        />
      )}
    </div>
  );
}

async function ProjectContent({
  chapterId,
  groupId,
  project,
  canManage,
  scope,
}: {
  chapterId: string;
  groupId: string;
  project: Project | null;
  canManage: boolean;
  scope: AccessScope;
}) {
  if (!project) return null;

  const [milestones, journey] = await Promise.all([
    listMilestonesByProject(project.id),
    getProjectJourney(groupId, project.id),
  ]);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Proje Durumu</CardTitle>
          <StatusPill tone={projectHealthTones[project.health]} icon={projectHealthIcons[project.health]}>
            {projectHealthLabels[project.health]}
          </StatusPill>
        </div>
        {canManage ? <ProjectStatusForm chapterId={chapterId} groupId={groupId} currentHealth={project.health} /> : null}
      </Card>

      <Card>
        <CardTitle>Proje Bilgileri</CardTitle>
        {canManage ? (
          <ProjectDetailsForm
            key={project.updatedAt?.toISOString() ?? 'unset'}
            chapterId={chapterId}
            groupId={groupId}
            initial={{
              name: project.name,
              shortDescription: project.shortDescription ?? '',
              researchQuestion: project.researchQuestion ?? '',
              purpose: project.purpose ?? '',
              startDate: project.startDate ?? '',
            }}
          />
        ) : (
          <ReadOnlyDetails project={project} />
        )}
      </Card>

      <Card>
        <CardTitle>Milestonelar</CardTitle>
        {milestones.length === 0 ? (
          <p className="mt-2 text-sm text-navy-500">Henüz milestone eklenmedi.</p>
        ) : (
          <ul className="mt-2 divide-y divide-navy-100">
            {milestones.map((milestone) => (
              <MilestoneRow
                key={milestone.id}
                chapterId={chapterId}
                groupId={groupId}
                canManage={canManage}
                canDelete={
                  milestone.status !== 'completed' &&
                  canDeleteMilestone(scope, { groupId, chapterId, createdByUserId: milestone.createdById })
                }
                milestone={{
                  id: milestone.id,
                  title: milestone.title,
                  description: milestone.description,
                  dueDate: milestone.dueDate,
                  status: milestone.status,
                }}
              />
            ))}
          </ul>
        )}
        {canManage ? <AddMilestoneForm chapterId={chapterId} groupId={groupId} /> : null}
      </Card>

      <Card>
        <CardTitle>Proje Yolculuğu</CardTitle>
        {journey.length === 0 ? (
          <p className="mt-2 text-sm text-navy-500">
            Henüz tamamlanmış bir haftalık kayıt veya milestone bulunmuyor.
          </p>
        ) : (
          <ol className="mt-3 space-y-4 border-l-2 border-navy-100 pl-4">
            {journey.map((entry, index) => (
              <li key={index}>
                <p className="text-xs text-navy-400">
                  <span className="font-medium uppercase tracking-wide">
                    {entry.type === 'session' ? `${entry.weekNumber}. Hafta` : 'Milestone'} ·{' '}
                    {formatShortDateTr(entry.date)}
                  </span>
                  {entry.type === 'session' && entry.authorName ? ` · ${entry.authorName}` : ''}
                </p>
                <p className="text-sm text-navy-800">{entry.label}</p>
                {entry.type === 'session' && entry.problem ? (
                  <p className="mt-1 text-sm text-amber-700">🚧 {entry.problem}</p>
                ) : null}
                {entry.type === 'session' && entry.nextStep ? (
                  <p className="mt-1 text-sm text-navy-500">Sıradaki adım: {entry.nextStep}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card>
        <CardTitle>Çıktı ve Final Teslim</CardTitle>
        {canManage ? (
          <OutcomeForm
            key={project.updatedAt?.toISOString() ?? 'unset'}
            chapterId={chapterId}
            groupId={groupId}
            initial={{
              outcomeSummary: project.outcomeSummary ?? '',
              finalDelivered: project.finalDelivered,
              externalReferenceUrl: project.externalReferenceUrl ?? '',
            }}
          />
        ) : (
          <ReadOnlyOutcome project={project} />
        )}
      </Card>
    </>
  );
}

function ReadOnlyDetails({
  project,
}: {
  project: { shortDescription: string | null; researchQuestion: string | null; purpose: string | null; startDate: string | null };
}) {
  return (
    <dl className="mt-2 space-y-3 text-sm">
      {project.shortDescription ? (
        <div>
          <dt className="font-medium text-navy-800">Kısa açıklama</dt>
          <dd className="text-navy-600">{project.shortDescription}</dd>
        </div>
      ) : null}
      {project.researchQuestion ? (
        <div>
          <dt className="font-medium text-navy-800">Araştırma/problem sorusu</dt>
          <dd className="text-navy-600">{project.researchQuestion}</dd>
        </div>
      ) : null}
      {project.purpose ? (
        <div>
          <dt className="font-medium text-navy-800">Amaç</dt>
          <dd className="text-navy-600">{project.purpose}</dd>
        </div>
      ) : null}
      {project.startDate ? (
        <div>
          <dt className="font-medium text-navy-800">Başlangıç tarihi</dt>
          <dd className="text-navy-600">{formatShortDateTr(project.startDate)}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function ReadOnlyOutcome({
  project,
}: {
  project: { outcomeSummary: string | null; finalDelivered: boolean; externalReferenceUrl: string | null };
}) {
  return (
    <div className="mt-2 space-y-2 text-sm">
      {project.outcomeSummary ? <p className="text-navy-700">{project.outcomeSummary}</p> : null}
      {project.finalDelivered ? (
        <StatusPill tone="ok" icon="✅">
          Final proje teslim edildi
        </StatusPill>
      ) : (
        <StatusPill tone="neutral">Final proje henüz teslim edilmedi</StatusPill>
      )}
      {project.externalReferenceUrl ? (
        <p>
          <a
            href={project.externalReferenceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-navy-600 underline hover:text-navy-800"
          >
            Dış referans bağlantısı
          </a>
        </p>
      ) : null}
    </div>
  );
}
