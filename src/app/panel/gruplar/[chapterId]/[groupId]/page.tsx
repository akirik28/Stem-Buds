import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canFinalizeWeeklyRecord, canManageChapter, canViewGroup } from '@/server/authz/policy';
import { getChapterById, listChapterMembers } from '@/server/services/chapter-service';
import { getGroupById, listGroupMembers } from '@/server/services/group-service';
import { listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { formatShortDateTr } from '@/lib/format';
import { weeklySessionStateLabels } from '@/lib/i18n/tr';
import { AddMemberForm } from './add-member-form';
import { AssignMentorForm } from './assign-mentor-form';
import { getMentorCardState } from './mentor-card-state';
import { GenerateSessionsButton } from './oturumlar/generate-sessions-button';
import { MemberRow } from './member-row';

export const metadata: Metadata = {
  title: 'Grup Üyeleri',
  robots: { index: false, follow: false },
};

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ chapterId: string; groupId: string }>;
}) {
  const { chapterId, groupId } = await params;
  const context = await requireAuthContext();

  const [chapter, group] = await Promise.all([getChapterById(chapterId), getGroupById(groupId)]);
  if (!chapter || !group || group.chapterId !== chapter.id) notFound();
  if (!canViewGroup(context.scope, group.id, chapter.id)) redirect('/panel/gruplar');

  const canManage = canManageChapter(context.scope, chapter.id);
  const members = await listGroupMembers(group.id);
  const chapterMembers = context.academicYearId
    ? await listChapterMembers(chapter.id, context.academicYearId)
    : [];

  const currentMentor = group.mentorUserId
    ? chapterMembers.find((person) => person.id === group.mentorUserId)
    : null;
  const mentorCandidates = chapterMembers.filter(
    (person) => person.role === 'mentor' && person.id !== group.mentorUserId,
  );

  const candidates = canManage
    ? chapterMembers.filter(
        (candidate) =>
          candidate.role === 'student' && !members.some((member) => member.userId === candidate.id),
      )
    : [];

  const mentorCardState = getMentorCardState({
    hasMentor: Boolean(currentMentor),
    alternativeCandidateCount: mentorCandidates.length,
  });

  const sessions = await listWeeklySessionsByGroup(group.id);
  const canFinalizeSessions = canFinalizeWeeklyRecord(context.scope, group.id, chapter.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/panel/gruplar/${chapter.id}`} className="text-sm text-navy-500 hover:text-navy-700">
          ← {chapter.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-navy-900">{group.name}</h1>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Mentor</CardTitle>
          {mentorCardState === 'draft_no_candidates' || mentorCardState === 'draft_with_candidates' ? (
            <StatusPill tone="warn" icon="📝">
              Taslak — mentor atanmadı
            </StatusPill>
          ) : null}
        </div>

        {currentMentor ? (
          <p className="mt-2 text-sm text-navy-700">
            {currentMentor.fullName} (@{currentMentor.username})
          </p>
        ) : (
          <p className="mt-2 text-sm text-navy-500">Bu gruba henüz mentor atanmadı.</p>
        )}

        {canManage &&
        (mentorCardState === 'draft_with_candidates' || mentorCardState === 'assigned_with_alternatives') ? (
          <AssignMentorForm chapterId={chapter.id} groupId={group.id} candidates={mentorCandidates} />
        ) : null}
        {mentorCardState === 'draft_no_candidates' && canManage ? (
          <p className="mt-3 text-xs text-navy-400">
            Atanabilecek mentor yok. Önce Kullanıcılar sayfasından bu chapter’a bir mentor atayın.
          </p>
        ) : null}
        {mentorCardState === 'assigned_no_alternatives' && canManage ? (
          <p className="mt-3 text-xs text-navy-400">Başka atanabilir mentor bulunmuyor.</p>
        ) : null}
      </Card>

      {canManage ? (
        <Card>
          <CardTitle>Öğrenci ekle</CardTitle>
          {candidates.length === 0 ? (
            <p className="mt-3 text-sm text-navy-500">
              Bu gruba eklenebilecek başka öğrenci bulunmuyor.
            </p>
          ) : (
            <AddMemberForm chapterId={chapter.id} groupId={group.id} candidates={candidates} />
          )}
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Haftalık Çalışmalar</CardTitle>
          {canFinalizeSessions ? (
            <GenerateSessionsButton chapterId={chapter.id} groupId={group.id} />
          ) : null}
        </div>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-navy-500">
            Henüz oturum oluşturulmadı. {canFinalizeSessions ? '"Oturumları Oluştur" ile başlayın.' : ''}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-navy-100">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/panel/gruplar/${chapter.id}/${group.id}/oturumlar/${session.id}`}
                  className="flex items-center justify-between py-2.5 text-sm hover:text-navy-900"
                >
                  <span className="text-navy-700">
                    {session.weekNumber}. Hafta — {formatShortDateTr(session.scheduledStartAt)}
                  </span>
                  <StatusPill tone={session.state === 'scheduled' ? 'info' : 'neutral'}>
                    {weeklySessionStateLabels[session.state]}
                  </StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Üyeler ({members.length})</CardTitle>
        {members.length === 0 ? (
          <EmptyState title="Bu grupta henüz üye yok." />
        ) : (
          <div className="mt-3 divide-y divide-navy-100">
            {members.map((member) => (
              <MemberRow
                key={member.id}
                chapterId={chapter.id}
                groupId={group.id}
                member={{
                  membershipId: member.id,
                  fullName: member.fullName,
                  username: member.username,
                  role: member.role,
                  isTeamLeader: member.isTeamLeader,
                }}
                canManage={canManage}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
