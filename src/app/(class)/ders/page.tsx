import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuthContext } from '@/server/auth/context';
import { isChapterHead, isExecutive, isMentor } from '@/server/authz/policy';
import {
  getActiveSession,
  getOrCreateChapterRun,
  listChapterGroupsForWeek,
  listLiveChapters,
} from '@/server/services/class-mode-service';
import { listGroupMembers } from '@/server/services/group-service';
import { getProjectByGroupId } from '@/server/services/project-service';
import {
  getPreviousHomeworkAssignment,
  getWorkLogBySessionId,
  listHomeworkStatuses,
} from '@/server/services/weekly-work-service';
import { listChapterMembers } from '@/server/services/chapter-service';
import { ChapterHeadGuide } from './chapter-head-guide';
import { ExecutiveGuide } from './executive-guide';
import { ClassWatch, ClassWatchSkeleton } from './class-watch';
import { MentorGuide } from './mentor-guide';

export const metadata: Metadata = {
  title: 'Ders Modu',
  robots: { index: false, follow: false },
};

/**
 * The panel during the session hour, and only then.
 *
 * Outside the window this page says so and sends you back; there is no
 * "preview the lesson guide" mode, because a guide you can open any time is
 * just another page to remember. Inside it, the person gets one screen with
 * one thing on it.
 */
export default async function ClassModePage() {
  const context = await requireAuthContext();
  const { scope, user } = context;

  const session = await getActiveSession(scope);

  if (!session) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">Şu anda ders yok</h1>
        <p className="mt-2 text-sm text-ink-2">
          Ders modu, oturum saatinden 15 dakika önce açılır ve bitiminden bir saat sonra kapanır.
        </p>
        <Link href="/panel" className="mt-6 inline-block text-sm font-medium text-ink hover:underline">
          ← Panelime dön
        </Link>
      </div>
    );
  }

  // Management roams: they get the whole organisation, not a checklist.
  if (isExecutive(scope.role)) {
    const live = await listLiveChapters(scope);
    return (
      <ExecutiveGuide
        weekNumber={session.weekNumber}
        chapters={live}
        watch={
          <Suspense fallback={<ClassWatchSkeleton />}>
            <ClassWatch weekNumber={session.weekNumber} />
          </Suspense>
        }
      />
    );
  }

  const run = await getOrCreateChapterRun(session.chapterId, session.academicYearId, session.weekNumber);

  if (isChapterHead(scope.role)) {
    const [rows, chapterMembers] = await Promise.all([
      listChapterGroupsForWeek(session.chapterId, session.academicYearId, session.weekNumber),
      listChapterMembers(session.chapterId, session.academicYearId),
    ]);
    const nameOf = (id: string | null) =>
      id ? (chapterMembers.find((person) => person.id === id)?.fullName ?? null) : null;

    return (
      <ChapterHeadGuide
        session={{
          chapterId: session.chapterId,
          chapterName: session.chapterName,
          meetingUrl: session.chapterMeetingUrl,
          academicYearId: session.academicYearId,
          weekNumber: session.weekNumber,
        }}
        roomsSplit={run.roomsSplitAt !== null}
        headAbsent={run.headAbsentAt !== null}
        groups={rows.map((row) => ({
          groupId: row.groupId,
          groupName: row.groupName,
          mentorName: nameOf(row.mentorUserId),
          mentorAbsent: row.mentorAbsentAt !== null,
          attendanceDone: row.attendanceFinalizedAt !== null,
        }))}
      />
    );
  }

  if (!isMentor(scope.role)) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-semibold text-ink">Ders modu mentörler içindir</h1>
        <Link href="/panel" className="mt-6 inline-block text-sm font-medium text-ink hover:underline">
          ← Panelime dön
        </Link>
      </div>
    );
  }

  const [members, log, previousHomework, project] = await Promise.all([
    listGroupMembers(session.groupId),
    getWorkLogBySessionId(session.sessionId),
    getPreviousHomeworkAssignment(session.sessionId),
    getProjectByGroupId(session.groupId, session.academicYearId),
  ]);

  const previousStatuses =
    previousHomework && !previousHomework.noHomework ? await listHomeworkStatuses(previousHomework.id) : [];

  const students = members
    .filter((member) => member.role === 'student')
    .map((member) => ({
      membershipId: member.id,
      fullName: member.fullName,
      previousStatus:
        previousStatuses.find((status) => status.groupMembershipId === member.id)?.status ?? 'pending',
    }));

  return (
    <MentorGuide
      viewerName={user.fullName.split(' ')[0] ?? user.fullName}
      session={{
        sessionId: session.sessionId,
        groupId: session.groupId,
        groupName: session.groupName,
        chapterName: session.chapterName,
        meetingUrl: session.chapterMeetingUrl,
        weekNumber: session.weekNumber,
      }}
      roomsSplit={run.roomsSplitAt !== null}
      students={students}
      hasPreviousHomework={Boolean(previousHomework && !previousHomework.noHomework)}
      previousHomeworkText={previousHomework?.description ?? null}
      alreadyAbsent={log?.mentorAbsentAt !== null && log?.mentorAbsentAt !== undefined}
      projectName={project?.name ?? null}
      initial={{
        whatWeDid: log?.whatWeDid ?? '',
        participation: log?.participation ?? null,
        projectStage: log?.projectStage ?? null,
      }}
    />
  );
}
