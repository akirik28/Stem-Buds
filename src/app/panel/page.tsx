import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuthContext } from '@/server/auth/context';
import type { AccessScope } from '@/server/authz/policy';
import { isAdvisorTeacher, isChapterHead, isExecutive, isMentor, isStudent } from '@/server/authz/policy';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { getGroupById, listGroupsByProgram, type Group } from '@/server/services/group-service';
import { getProjectByGroupId, type Project } from '@/server/services/project-service';
import { getProgramById } from '@/server/services/program-service';
import { getPendingFeedbackCycleForStudent } from '@/server/services/feedback-service';
import { listAlertsForMentor, getManagementKpis } from '@/server/services/alert-query';
import { listComplaintsForViewer } from '@/server/services/complaint-service';
import { listContinuousFeedbackForViewer } from '@/server/services/feedback-service';
import { listChannelsForViewer } from '@/server/services/messaging-service';
import { Card, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { projectHealthLabels, projectHealthIcons, roleDescriptions, roleLabels } from '@/lib/i18n/tr';
import { formatPercent } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Panelim',
  robots: { index: false, follow: false },
};

/**
 * The one dashboard every role lands on after login — role-specific
 * content built entirely from services that already exist (Phases 1–7);
 * no new domain logic here. Deliberately AI-free: Phase 5 named exactly
 * five bounded AI surfaces and this page isn't one of them, so it only
 * ever links out to Yönetim Akışı rather than embedding an AI card.
 */
export default async function PanelHomePage() {
  const context = await requireAuthContext();
  const { scope } = context;
  const academicYear = await getActiveAcademicYear();

  const unreadTotal = isAdvisorTeacher(scope.role)
    ? null
    : (await listChannelsForViewer(scope)).reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Merhaba {context.user.fullName.split(' ')[0]},</h1>
        <p className="mt-1 text-sm text-navy-500">
          {roleLabels[context.user.role]} — {roleDescriptions[context.user.role]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-lg font-semibold text-navy-900">{academicYear?.label ?? '—'}</p>
          <p className="mt-1 text-xs text-navy-500">Aktif Akademik Yıl</p>
        </Card>
        {unreadTotal !== null ? (
          <Link href="/panel/mesajlar">
            <Card className="text-center hover:bg-sand-50">
              <p className="text-lg font-semibold text-navy-900">{unreadTotal}</p>
              <p className="mt-1 text-xs text-navy-500">Okunmamış Mesaj</p>
            </Card>
          </Link>
        ) : null}
      </div>

      {isStudent(scope.role) ? await StudentSection(scope, academicYear?.id ?? null) : null}
      {isMentor(scope.role) ? await MentorSection(scope, academicYear?.id ?? null) : null}
      {isChapterHead(scope.role) || isExecutive(scope.role) ? await ManagementSection(scope) : null}
      {isAdvisorTeacher(scope.role) ? await AdvisorSection(scope, academicYear?.id ?? null) : null}
    </div>
  );
}

async function StudentSection(scope: AccessScope, academicYearId: string | null) {
  const groups = (await Promise.all(scope.studentGroupIds.map((id) => getGroupById(id)))).filter((g): g is Group => g !== null);
  const pendingCycle = await getPendingFeedbackCycleForStudent(scope);

  return (
    <div className="space-y-4">
      {pendingCycle ? (
        <Card className="ring-1 ring-inset ring-amber-200">
          <CardTitle>Son üç çalışmayı değerlendir</CardTitle>
          <p className="mt-1 text-sm text-navy-600">Kısa bir değerlendirme bekliyor.</p>
          <Link href="/panel/geri-bildirim" className="mt-2 inline-block text-sm font-medium text-navy-800 hover:underline">
            Değerlendirmeyi doldur →
          </Link>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-navy-500">Henüz bir gruba atanmadınız.</p>
        </Card>
      ) : (
        await Promise.all(
          groups.map(async (group) => {
            const project = academicYearId ? await getProjectByGroupId(group.id, academicYearId) : null;
            return (
              <Card key={group.id}>
                <CardTitle>{group.name}</CardTitle>
                <ProjectSnapshot project={project} />
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link href="/panel/haftalik-calismalar" className="text-navy-700 hover:underline">
                    Haftalık Çalışmalar →
                  </Link>
                  <Link href="/panel/projeler" className="text-navy-700 hover:underline">
                    Proje →
                  </Link>
                </div>
              </Card>
            );
          }),
        )
      )}
    </div>
  );
}

async function MentorSection(scope: AccessScope, academicYearId: string | null) {
  const groups = (await Promise.all(scope.mentorGroupIds.map((id) => getGroupById(id)))).filter((g): g is Group => g !== null);
  const alerts = await listAlertsForMentor(scope);

  return (
    <div className="space-y-4">
      {alerts.length > 0 ? (
        <Card className="ring-1 ring-inset ring-amber-200">
          <div className="flex items-center justify-between">
            <CardTitle>Dikkat Gerektirenler</CardTitle>
            <StatusPill tone="warn">{alerts.length}</StatusPill>
          </div>
          <Link href="/panel/dikkat-gerektirenler" className="mt-2 inline-block text-sm font-medium text-navy-800 hover:underline">
            Uyarıları görüntüle →
          </Link>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-navy-500">Henüz bir gruba atanmadınız.</p>
        </Card>
      ) : (
        await Promise.all(
          groups.map(async (group) => {
            const project = academicYearId ? await getProjectByGroupId(group.id, academicYearId) : null;
            return (
              <Card key={group.id}>
                <CardTitle>{group.name}</CardTitle>
                <ProjectSnapshot project={project} />
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <Link href={`/panel/gruplar/${group.chapterId}/${group.id}`} className="text-navy-700 hover:underline">
                    Grubu Görüntüle →
                  </Link>
                </div>
              </Card>
            );
          }),
        )
      )}
    </div>
  );
}

async function ManagementSection(scope: AccessScope) {
  const [kpis, complaints, feedback] = await Promise.all([
    getManagementKpis(scope),
    listComplaintsForViewer(scope),
    listContinuousFeedbackForViewer(scope, { onlyUnreviewed: true }),
  ]);
  const openComplaints = complaints.filter((c) => c.status !== 'resolved').length;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Genel Durum</CardTitle>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Kpi label="Aktif Chapter" value={String(kpis.activeChapters)} />
          <Kpi label="Aktif Grup" value={String(kpis.activeGroups)} />
          <Kpi label="Katılım" value={formatPercent(kpis.attendanceRate !== null ? kpis.attendanceRate * 100 : null)} />
          <Kpi label="Açık Uyarı" value={String(kpis.openAlertCount)} />
          <Kpi label="Açık Şikâyet" value={String(openComplaints)} />
          <Kpi label="İncelenmemiş Geri Bildirim" value={String(feedback.length)} />
        </div>
        <Link href="/panel/yonetim-akisi" className="mt-3 inline-block text-sm font-medium text-navy-800 hover:underline">
          Yönetim Akışına git →
        </Link>
      </Card>
    </div>
  );
}

async function AdvisorSection(scope: AccessScope, academicYearId: string | null) {
  if (!academicYearId) return null;
  const programSummaries = await Promise.all(
    scope.advisorProgramIds.map(async (programId) => {
      const program = await getProgramById(programId);
      const groups = await listGroupsByProgram(programId, academicYearId);
      return { programId, label: program?.shortName ?? '—', groupCount: groups.length };
    }),
  );

  return (
    <Card>
      <CardTitle>Yetkili Programlar</CardTitle>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {programSummaries.map((p) => (
          <div key={p.programId} className="rounded-lg bg-sand-50 px-3 py-2">
            <p className="text-sm font-medium text-navy-800">{p.label}</p>
            <p className="text-xs text-navy-500">{p.groupCount} grup</p>
          </div>
        ))}
      </div>
      <Link href="/panel/grup-ozetleri" className="mt-3 inline-block text-sm font-medium text-navy-800 hover:underline">
        Grup Özetlerini görüntüle →
      </Link>
    </Card>
  );
}

function ProjectSnapshot({ project }: { project: Project | null }) {
  if (!project) return <p className="mt-2 text-sm text-navy-500">Henüz proje oluşturulmadı.</p>;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-navy-600">
      <StatusPill tone={project.health === 'on_track' ? 'ok' : project.health === 'attention' ? 'warn' : 'danger'}>
        {projectHealthIcons[project.health]} {projectHealthLabels[project.health]}
      </StatusPill>
      <span>{project.name}</span>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-semibold text-navy-900">{value}</p>
      <p className="mt-0.5 text-xs text-navy-500">{label}</p>
    </div>
  );
}
