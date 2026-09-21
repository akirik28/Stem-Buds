import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuthContext } from '@/server/auth/context';
import type { AccessScope } from '@/server/authz/policy';
import { isAdvisorTeacher, isChapterHead, isExecutive, isMentor, isParent, isStudent } from '@/server/authz/policy';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { getGroupById, listGroupsByProgram, type Group } from '@/server/services/group-service';
import { getProjectByGroupId, type Project } from '@/server/services/project-service';
import { getProgramById } from '@/server/services/program-service';
import { getPendingFeedbackCycleForStudent } from '@/server/services/feedback-service';
import { getChildOverview, listChildren } from '@/server/services/parent-service';
import { listAlertsForMentor, getManagementKpis } from '@/server/services/alert-query';
import { listComplaintsForViewer } from '@/server/services/complaint-service';
import { listContinuousFeedbackForViewer } from '@/server/services/feedback-service';
import { listChannelsForViewer } from '@/server/services/messaging-service';
import { Card, CardTitle, EmptyState, MetricGrid, MetricTile } from '@/components/ui/card';
import { StatusPill, projectHealthTones } from '@/components/ui/status';
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

  const unreadTotal = isAdvisorTeacher(scope.role) || isParent(scope.role)
    ? null
    : (await listChannelsForViewer(scope)).reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="font-display text-[30px]/[1.15] font-semibold tracking-[-0.02em] text-ink">
            Merhaba {context.user.fullName.split(' ')[0]},
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            {roleLabels[context.user.role]} — {roleDescriptions[context.user.role]}
          </p>
        </div>
        {academicYear ? (
          <span className="flex items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3.5 py-2">
            <span className="text-[11px] font-medium text-ink-3">Akademik yıl</span>
            <span className="text-[13px] font-semibold text-ink">{academicYear.label}</span>
          </span>
        ) : null}
      </div>

      {unreadTotal !== null && unreadTotal > 0 ? (
        <Link href="/panel/mesajlar" className="rounded-[15px]">
          <MetricTile
            tone="info"
            value={unreadTotal}
            label="Okunmamış Mesaj"
            hint="Mesajlara git →"
          />
        </Link>
      ) : null}

      {isStudent(scope.role) ? await StudentSection(scope, academicYear?.id ?? null) : null}
      {isMentor(scope.role) ? await MentorSection(scope, academicYear?.id ?? null) : null}
      {isChapterHead(scope.role) || isExecutive(scope.role) ? await ManagementSection(scope) : null}
      {isAdvisorTeacher(scope.role) ? await AdvisorSection(scope, academicYear?.id ?? null) : null}
      {isParent(scope.role) ? await ParentSection(scope) : null}
    </div>
  );
}

async function StudentSection(scope: AccessScope, academicYearId: string | null) {
  const groups = (await Promise.all(scope.studentGroupIds.map((id) => getGroupById(id)))).filter((g): g is Group => g !== null);
  const pendingCycle = await getPendingFeedbackCycleForStudent(scope);

  return (
    <div className="space-y-4">
      {pendingCycle ? (
        <Card className="ring-1 ring-inset ring-warn-line">
          <CardTitle>Son üç çalışmayı değerlendir</CardTitle>
          <p className="mt-1 text-sm text-ink-2">Kısa bir değerlendirme bekliyor.</p>
          <Link href="/panel/geri-bildirim" className="mt-2 inline-block text-sm font-medium text-ink hover:underline">
            Değerlendirmeyi doldur →
          </Link>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-3">Henüz bir gruba atanmadınız.</p>
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
                  <Link href="/panel/haftalik-calismalar" className="text-ink-2 hover:underline">
                    Haftalık Çalışmalar →
                  </Link>
                  <Link href="/panel/projeler" className="text-ink-2 hover:underline">
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
        <Card className="ring-1 ring-inset ring-warn-line">
          <div className="flex items-center justify-between">
            <CardTitle>Dikkat Gerektirenler</CardTitle>
            <StatusPill tone="warn">{alerts.length}</StatusPill>
          </div>
          <Link href="/panel/dikkat-gerektirenler" className="mt-2 inline-block text-sm font-medium text-ink hover:underline">
            Uyarıları görüntüle →
          </Link>
        </Card>
      ) : null}

      {groups.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-3">Henüz bir gruba atanmadınız.</p>
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
                  <Link href={`/panel/gruplar/${group.chapterId}/${group.id}`} className="text-ink-2 hover:underline">
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
        <MetricGrid className="mt-3.5">
          <MetricTile value={kpis.activeChapters} label="Aktif Chapter" />
          <MetricTile value={kpis.activeGroups} label="Aktif Grup" />
          <MetricTile
            value={formatPercent(kpis.attendanceRate !== null ? kpis.attendanceRate * 100 : null)}
            label="Katılım"
            tone={attendanceTone(kpis.attendanceRate)}
          />
          <MetricTile
            value={kpis.openAlertCount}
            label="Açık Uyarı"
            tone={kpis.openAlertCount > 0 ? 'danger' : 'ok'}
          />
          <MetricTile
            value={openComplaints}
            label="Açık Şikâyet"
            tone={openComplaints > 0 ? 'warn' : 'ok'}
          />
          <MetricTile
            value={feedback.length}
            label="İncelenmemiş Geri Bildirim"
            tone={feedback.length > 0 ? 'warn' : 'ok'}
          />
        </MetricGrid>
        <Link href="/panel/yonetim-akisi" className="mt-3 inline-block text-sm font-medium text-ink hover:underline">
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
          <div key={p.programId} className="rounded-lg bg-bg px-3 py-2">
            <p className="text-sm font-medium text-ink">{p.label}</p>
            <p className="text-xs text-ink-3">{p.groupCount} grup</p>
          </div>
        ))}
      </div>
      <Link href="/panel/grup-ozetleri" className="mt-3 inline-block text-sm font-medium text-ink hover:underline">
        Grup Özetlerini görüntüle →
      </Link>
    </Card>
  );
}

/**
 * The parent's landing view: one card per child, answering the three things
 * a parent actually opens this for — did they attend, is homework done, how
 * is the project going. No other student appears anywhere on it.
 */
async function ParentSection(scope: AccessScope) {
  const children = await listChildren(scope);
  if (children.length === 0) {
    return <EmptyState title="Hesabınıza henüz bir öğrenci bağlanmadı." />;
  }

  return (
    <div className="flex flex-col gap-4">
      {await Promise.all(
        children.map(async (child) => {
          const overview = await getChildOverview(scope, child.studentUserId);
          return (
            <Card key={child.studentUserId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{overview.studentName}</CardTitle>
                  <p className="mt-1 text-[12.5px] text-ink-3">
                    {overview.groupName ?? 'Grup atanmadı'}
                    {overview.mentorName ? ` · Mentor: ${overview.mentorName}` : null}
                  </p>
                </div>
                <StatusPill tone="info" icon="◇" dashed>
                  Salt okunur
                </StatusPill>
              </div>

              <MetricGrid className="mt-3.5">
                <MetricTile
                  value={formatPercent(
                    overview.attendance.rate !== null ? overview.attendance.rate * 100 : null,
                  )}
                  label="Katılım"
                  tone={attendanceTone(overview.attendance.rate)}
                  hint="Mazeretli sayılmaz"
                />
                <MetricTile value={overview.homework.done} label="Yapılan ödev" tone="ok" />
                <MetricTile
                  value={overview.homework.notDone}
                  label="Yapılmayan ödev"
                  tone={overview.homework.notDone > 0 ? 'warn' : 'ok'}
                />
                <MetricTile
                  value={`${overview.milestones.completed}/${overview.milestones.total}`}
                  label="Kilometre taşı"
                  tone="neutral"
                />
              </MetricGrid>

              <div className="mt-3.5 flex flex-wrap gap-3 text-[13px]">
                <Link href="/panel/cocugum/gelisim" className="font-semibold text-ink-2 hover:underline">
                  Gelişim →
                </Link>
                <Link href="/panel/cocugum/grup" className="font-semibold text-ink-2 hover:underline">
                  Grubu →
                </Link>
                <Link href="/panel/cocugum/iletisim" className="font-semibold text-ink-2 hover:underline">
                  Yönetimle iletişim →
                </Link>
              </div>
            </Card>
          );
        }),
      )}
    </div>
  );
}

function ProjectSnapshot({ project }: { project: Project | null }) {
  if (!project) return <p className="mt-2 text-sm text-ink-3">Henüz proje oluşturulmadı.</p>;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
      <StatusPill tone={projectHealthTones[project.health]}>
        {projectHealthIcons[project.health]} {projectHealthLabels[project.health]}
      </StatusPill>
      <span>{project.name}</span>
    </div>
  );
}

/**
 * Attendance is the one KPI with a published threshold rather than a
 * simple "anything above zero is bad": the program's own yellow/red lines
 * are 80% and 65%.
 */
function attendanceTone(rate: number | null): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (rate === null) return 'neutral';
  const percent = rate * 100;
  if (percent < 65) return 'danger';
  if (percent < 80) return 'warn';
  return 'ok';
}
