import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import {
  canApproveWeeklySession,
  canDeleteHomeworkAssignment,
  canEditWeeklyNarrative,
  canFinalizeWeeklyRecord,
  canViewGroup,
} from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { getGroupById, listGroupMembers } from '@/server/services/group-service';
import { getWeeklySessionById } from '@/server/services/weekly-session-service';
import {
  getHomeworkAssignmentBySessionId,
  getMissingRequirements,
  getPreviousHomeworkAssignment,
  getWorkLogBySessionId,
  listAttendanceBySession,
  listHomeworkStatuses,
} from '@/server/services/weekly-work-service';
import { Card, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { formatDateTr, formatTimeRangeTr } from '@/lib/format';
import { attendanceLabels, homeworkStatusLabels, weeklySessionStateLabels } from '@/lib/i18n/tr';
import { AttendanceForm } from './attendance-form';
import { NarrativeForm } from './narrative-form';
import { HomeworkForm } from './homework-form';
import { DeleteHomeworkButton } from './delete-homework-button';
import { PreviousHomeworkForm } from './previous-homework-form';
import { ApproveButton } from './approve-button';

export const metadata: Metadata = {
  title: 'Haftalık Çalışma Kaydı',
  robots: { index: false, follow: false },
};

export default async function WeeklySessionPage({
  params,
}: {
  params: Promise<{ chapterId: string; groupId: string; sessionId: string }>;
}) {
  const { chapterId, groupId, sessionId } = await params;
  const context = await requireAuthContext();

  const [chapter, group, session] = await Promise.all([
    getChapterById(chapterId),
    getGroupById(groupId),
    getWeeklySessionById(sessionId),
  ]);
  if (!chapter || !group || !session) notFound();
  if (group.chapterId !== chapter.id || session.groupId !== group.id) notFound();
  if (!canViewGroup(context.scope, group.id, chapter.id)) redirect('/panel/gruplar');

  const canEditNarrative = canEditWeeklyNarrative(context.scope, group.id, chapter.id);
  const canFinalize = canFinalizeWeeklyRecord(context.scope, group.id, chapter.id);
  const canApprove = canApproveWeeklySession(context.scope, group.id, chapter.id);

  const [members, workLog, attendance, homework, previousHomework, missing] = await Promise.all([
    listGroupMembers(group.id),
    getWorkLogBySessionId(sessionId),
    listAttendanceBySession(sessionId),
    getHomeworkAssignmentBySessionId(sessionId),
    getPreviousHomeworkAssignment(sessionId),
    getMissingRequirements(sessionId),
  ]);

  const students = members.filter((m) => m.role === 'student');
  const attendanceByMembership = new Map(attendance.map((a) => [a.groupMembershipId, a]));
  const previousStatuses = previousHomework ? await listHomeworkStatuses(previousHomework.id) : [];
  const previousStatusByMembership = new Map(previousStatuses.map((s) => [s.groupMembershipId, s]));
  const isComplete = workLog?.completedAt !== null && workLog?.completedAt !== undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/panel/gruplar/${chapter.id}/${group.id}`}
          className="text-sm text-navy-500 hover:text-navy-700"
        >
          ← {group.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-navy-900">{group.name} — {session.weekNumber}. Hafta</h1>
          {isComplete ? (
            <StatusPill tone="ok" icon="✅">
              Tamamlandı
            </StatusPill>
          ) : (
            <StatusPill tone="warn" icon="⏳">
              Devam ediyor
            </StatusPill>
          )}
          {session.state !== 'scheduled' ? (
            <StatusPill tone="neutral">{weeklySessionStateLabels[session.state]}</StatusPill>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-navy-500">
          {formatDateTr(session.scheduledStartAt)} · {formatTimeRangeTr(session.scheduledStartAt, session.scheduledEndAt)}
        </p>
      </div>

      {!isComplete && missing.length > 0 ? (
        <Card className="border-l-4 border-amber-500">
          <p className="text-sm font-medium text-navy-800">Eksik gereklilikler</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-navy-600">
            {missing.map((item) => (
              <li key={item.code}>{item.label}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {session.state === 'holiday' ? (
        <Card>
          <p className="text-sm text-navy-700">
            🏖️ Bu hafta çalışma yok / tatil{session.cancellationReason ? `: ${session.cancellationReason}` : '.'}
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle>Katılım</CardTitle>
            {canFinalize ? (
              <AttendanceForm
                // React resets an uncontrolled <form>'s fields after a
                // successful action; keying on the exact moment attendance
                // was last saved forces a remount so `defaultValue` picks up
                // the fresh server data instead of reverting to blank.
                key={workLog?.attendanceFinalizedAt?.toISOString() ?? 'unset'}
                chapterId={chapter.id}
                groupId={group.id}
                sessionId={session.id}
                students={students.map((s) => ({
                  membershipId: s.id,
                  fullName: s.fullName,
                  username: s.username,
                  currentStatus: attendanceByMembership.get(s.id)?.status ?? null,
                  currentNote: attendanceByMembership.get(s.id)?.note ?? null,
                }))}
                finalized={workLog?.attendanceFinalizedAt !== null && workLog?.attendanceFinalizedAt !== undefined}
              />
            ) : (
              <ReadOnlyAttendance students={students} attendanceByMembership={attendanceByMembership} />
            )}
          </Card>

          <Card>
            <CardTitle>Haftalık Çalışma Raporu</CardTitle>
            {canEditNarrative ? (
              <NarrativeForm
                key={workLog?.updatedAt?.toISOString() ?? 'unset'}
                chapterId={chapter.id}
                groupId={group.id}
                sessionId={session.id}
                initial={{
                  whatWeDid: workLog?.whatWeDid ?? '',
                  outputs: workLog?.outputs ?? '',
                  problems: workLog?.problems ?? '',
                  nextWeekGoal: workLog?.nextWeekGoal ?? '',
                  projectHealth: workLog?.projectHealth ?? '',
                }}
              />
            ) : (
              <ReadOnlyNarrative workLog={workLog} />
            )}
          </Card>

          <Card>
            <CardTitle>Bu Haftanın Ödevi</CardTitle>
            {canFinalize ? (
              <HomeworkForm
                key={homework?.updatedAt?.toISOString() ?? 'unset'}
                chapterId={chapter.id}
                groupId={group.id}
                sessionId={session.id}
                initial={{
                  noHomework: homework?.noHomework ?? false,
                  description: homework?.description ?? '',
                  dueDate: homework?.dueDate ?? '',
                }}
              />
            ) : (
              <ReadOnlyHomework homework={homework} />
            )}
            {homework &&
            homework.resultsFinalizedAt === null &&
            canDeleteHomeworkAssignment(context.scope, {
              groupId: group.id,
              chapterId: chapter.id,
              createdByUserId: homework.createdById,
            }) ? (
              <DeleteHomeworkButton
                chapterId={chapter.id}
                groupId={group.id}
                sessionId={session.id}
                assignmentId={homework.id}
              />
            ) : null}
          </Card>

          {previousHomework ? (
            <Card>
              <CardTitle>Önceki Haftanın Ödev Sonuçları</CardTitle>
              <p className="mt-1 text-sm text-navy-500">{previousHomework.description}</p>
              {canFinalize ? (
                <PreviousHomeworkForm
                  key={workLog?.previousHomeworkFinalizedAt?.toISOString() ?? 'unset'}
                  chapterId={chapter.id}
                  groupId={group.id}
                  sessionId={session.id}
                  students={students.map((s) => ({
                    membershipId: s.id,
                    fullName: s.fullName,
                    username: s.username,
                    currentStatus: previousStatusByMembership.get(s.id)?.status ?? 'pending',
                  }))}
                  finalized={workLog?.previousHomeworkFinalizedAt !== null && workLog?.previousHomeworkFinalizedAt !== undefined}
                />
              ) : (
                <ReadOnlyHomeworkStatuses students={students} statusByMembership={previousStatusByMembership} />
              )}
            </Card>
          ) : null}

          {canApprove ? (
            <ApproveButton
              chapterId={chapter.id}
              groupId={group.id}
              sessionId={session.id}
              alreadyApproved={workLog?.mentorApprovedAt !== null && workLog?.mentorApprovedAt !== undefined}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function ReadOnlyAttendance({
  students,
  attendanceByMembership,
}: {
  students: { id: string; fullName: string; username: string }[];
  attendanceByMembership: Map<string, { status: keyof typeof attendanceLabels; note: string | null }>;
}) {
  if (students.length === 0) return <p className="mt-2 text-sm text-navy-500">Grup üyesi yok.</p>;
  return (
    <ul className="mt-3 divide-y divide-navy-100">
      {students.map((s) => {
        const record = attendanceByMembership.get(s.id);
        return (
          <li key={s.id} className="flex items-center justify-between py-2 text-sm">
            <span>{s.fullName}</span>
            <span className="text-navy-500">{record ? attendanceLabels[record.status] : 'Bekliyor'}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ReadOnlyNarrative({ workLog }: { workLog: { whatWeDid: string | null; nextWeekGoal: string | null; projectHealth: string | null } | null }) {
  if (!workLog?.whatWeDid) return <p className="mt-2 text-sm text-navy-500">Henüz rapor girilmedi.</p>;
  return (
    <div className="mt-2 space-y-2 text-sm text-navy-700">
      <p>{workLog.whatWeDid}</p>
      {workLog.nextWeekGoal ? <p className="text-navy-500">Gelecek hafta: {workLog.nextWeekGoal}</p> : null}
    </div>
  );
}

function ReadOnlyHomework({ homework }: { homework: { noHomework: boolean; description: string | null } | null }) {
  if (!homework) return <p className="mt-2 text-sm text-navy-500">Henüz belirlenmedi.</p>;
  return (
    <p className="mt-2 text-sm text-navy-700">
      {homework.noHomework ? 'Bu hafta ödev yok.' : homework.description}
    </p>
  );
}

function ReadOnlyHomeworkStatuses({
  students,
  statusByMembership,
}: {
  students: { id: string; fullName: string }[];
  statusByMembership: Map<string, { status: keyof typeof homeworkStatusLabels }>;
}) {
  return (
    <ul className="mt-3 divide-y divide-navy-100">
      {students.map((s) => (
        <li key={s.id} className="flex items-center justify-between py-2 text-sm">
          <span>{s.fullName}</span>
          <span className="text-navy-500">
            {homeworkStatusLabels[statusByMembership.get(s.id)?.status ?? 'pending']}
          </span>
        </li>
      ))}
    </ul>
  );
}
