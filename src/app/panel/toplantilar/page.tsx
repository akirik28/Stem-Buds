import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canManageChapter, isAdvisorTeacher, isChapterHead, isExecutive, isMentor, isStudent } from '@/server/authz/policy';
import {
  listExecutiveMeetings,
  listMentorMeetings,
  listMyInvitedProgramMeetings,
  listProgramMeetingCandidates,
  listProgramMeetings,
} from '@/server/services/mentor-meeting-service';
import { listChapters } from '@/server/services/chapter-service';
import { listPrograms } from '@/server/services/program-service';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { formatDateTimeTr } from '@/lib/format';
import { CreateMeetingForm } from './create-meeting-form';
import { CreateProgramMeetingForm } from './create-program-meeting-form';
import { CreateExecutiveMeetingForm } from './create-executive-meeting-form';

export const metadata: Metadata = {
  title: 'Mentor Toplantıları',
  robots: { index: false, follow: false },
};

function MeetingList({ meetings }: { meetings: Awaited<ReturnType<typeof listMentorMeetings>> }) {
  if (meetings.length === 0) return <EmptyState title="Henüz toplantı bulunmuyor." />;
  return (
    <div className="space-y-2">
      {meetings.map((meeting) => (
        <Link key={meeting.id} href={`/panel/toplantilar/${meeting.id}`}>
          <Card className="hover:bg-sand-50">
            <p className="font-medium text-navy-900">{meeting.title}</p>
            <p className="mt-1 text-xs text-navy-400">
              {meeting.sequence} · {formatDateTimeTr(meeting.startsAt)}
            </p>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default async function MentorMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string; program?: string; scope?: string }>;
}) {
  const context = await requireAuthContext();
  if (isStudent(context.scope.role) || isAdvisorTeacher(context.scope.role)) redirect('/panel');

  const { chapter: chapterParam, program: programParam, scope: scopeParam } = await searchParams;
  const academicYear = await getActiveAcademicYear();
  const exec = isExecutive(context.scope.role);
  const viewScope: 'chapter' | 'program' | 'executive' =
    exec && scopeParam === 'program' ? 'program' : exec && scopeParam === 'executive' ? 'executive' : 'chapter';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Mentor Toplantıları</h1>
        <p className="mt-1 text-sm text-navy-500">Chapter Head ve mentor ekipleriyle, Program çapında, ya da Yönetim ekibiyle toplantı gündemi ve kararlar.</p>
      </div>

      {exec ? (
        <nav aria-label="Görünüm seçimi" className="flex flex-wrap gap-2">
          <Link
            href="/panel/toplantilar?scope=chapter"
            className={
              viewScope === 'chapter'
                ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
                : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
            }
          >
            Chapter Toplantıları
          </Link>
          <Link
            href="/panel/toplantilar?scope=program"
            className={
              viewScope === 'program'
                ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
                : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
            }
          >
            Program Toplantıları
          </Link>
          <Link
            href="/panel/toplantilar?scope=executive"
            className={
              viewScope === 'executive'
                ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
                : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
            }
          >
            Yönetim Toplantısı
          </Link>
        </nav>
      ) : null}

      {!academicYear ? (
        <EmptyState title="Aktif akademik yıl bulunamadı." />
      ) : viewScope === 'program' ? (
        <ProgramMeetingsView programParam={programParam} academicYearId={academicYear.id} />
      ) : viewScope === 'executive' ? (
        <ExecutiveMeetingsView academicYearId={academicYear.id} />
      ) : (
        <ChapterMeetingsView context={context} chapterParam={chapterParam} academicYearId={academicYear.id} exec={exec} />
      )}

      {!exec && (isChapterHead(context.scope.role) || isMentor(context.scope.role)) ? (
        <div className="space-y-3 border-t border-navy-100 pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">Katıldığım Program Toplantıları</h2>
          <MeetingList meetings={await listMyInvitedProgramMeetings(context.scope)} />
        </div>
      ) : null}
    </div>
  );
}

async function ChapterMeetingsView({
  context,
  chapterParam,
  academicYearId,
  exec,
}: {
  context: Awaited<ReturnType<typeof requireAuthContext>>;
  chapterParam: string | undefined;
  academicYearId: string;
  exec: boolean;
}) {
  let chapterId: string | null = null;
  let chapters: Awaited<ReturnType<typeof listChapters>> = [];
  if (exec) {
    chapters = await listChapters();
    chapterId = chapterParam ?? null;
  } else {
    chapterId = context.scope.headChapterIds[0] ?? context.scope.memberChapterIds[0] ?? null;
  }

  const meetings = chapterId ? await listMentorMeetings(context.scope, chapterId, academicYearId) : [];
  const canManage = chapterId ? canManageChapter(context.scope, chapterId) : false;

  return (
    <div className="space-y-6">
      {exec ? (
        <nav aria-label="Chapter seçimi" className="flex flex-wrap gap-2">
          {chapters.map((chapter) => (
            <Link
              key={chapter.id}
              href={`/panel/toplantilar?scope=chapter&chapter=${chapter.id}`}
              className={
                chapterId === chapter.id
                  ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
                  : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
              }
            >
              {chapter.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {!chapterId ? (
        <EmptyState title={exec ? 'Görüntülemek için bir chapter seçin.' : 'Bağlı bir chapter’ınız bulunmuyor.'} />
      ) : (
        <>
          {canManage ? (
            <Card>
              <CardTitle>Yeni Toplantı</CardTitle>
              <div className="mt-3">
                <CreateMeetingForm chapterId={chapterId} academicYearId={academicYearId} />
              </div>
            </Card>
          ) : null}
          <MeetingList meetings={meetings} />
        </>
      )}
    </div>
  );
}

async function ProgramMeetingsView({ programParam, academicYearId }: { programParam: string | undefined; academicYearId: string }) {
  const programs = await listPrograms();
  const programId = programParam ?? null;
  const context = await requireAuthContext();

  const [meetings, candidates] = await Promise.all([
    programId ? listProgramMeetings(context.scope, programId, academicYearId) : Promise.resolve([]),
    programId ? listProgramMeetingCandidates(programId, academicYearId) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <nav aria-label="Program seçimi" className="flex flex-wrap gap-2">
        {programs.map((program) => (
          <Link
            key={program.id}
            href={`/panel/toplantilar?scope=program&program=${program.id}`}
            className={
              programId === program.id
                ? 'inline-flex min-h-9 items-center rounded-full bg-navy-800 px-3.5 text-sm font-medium text-white'
                : 'inline-flex min-h-9 items-center rounded-full bg-white px-3.5 text-sm font-medium text-navy-600 ring-1 ring-inset ring-navy-200 hover:bg-navy-50'
            }
          >
            {program.shortName}
          </Link>
        ))}
      </nav>

      {!programId ? (
        <EmptyState title="Görüntülemek için bir Program seçin." />
      ) : (
        <>
          <Card>
            <CardTitle>Yeni Program Toplantısı</CardTitle>
            <p className="mt-1 text-sm text-navy-500">Katılımcıları tek tek seçin — bu Program’ın chapter head’leri ve mentorları arasından.</p>
            <div className="mt-3">
              <CreateProgramMeetingForm programId={programId} academicYearId={academicYearId} candidates={candidates} />
            </div>
          </Card>
          <MeetingList meetings={meetings} />
        </>
      )}
    </div>
  );
}

async function ExecutiveMeetingsView({ academicYearId }: { academicYearId: string }) {
  const context = await requireAuthContext();
  const meetings = await listExecutiveMeetings(context.scope, academicYearId);

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Yeni Yönetim Toplantısı</CardTitle>
        <p className="mt-1 text-sm text-navy-500">
          Katılımcı seçimi yok — mevcut tüm Regional Director ve Vice President hesapları otomatik olarak eklenir.
        </p>
        <div className="mt-3">
          <CreateExecutiveMeetingForm academicYearId={academicYearId} />
        </div>
      </Card>
      <MeetingList meetings={meetings} />
    </div>
  );
}
