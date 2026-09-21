import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canManageMeeting, getMeetingParticipants, getMentorMeetingForViewer, listMentorMeetingAttendance } from '@/server/services/mentor-meeting-service';
import { getChapterById } from '@/server/services/chapter-service';
import { getProgramById } from '@/server/services/program-service';
import { Card, CardTitle } from '@/components/ui/card';
import { formatDateTimeTr } from '@/lib/format';
import { meetingAttendanceLabels } from '@/lib/i18n/tr';
import { NotesForm } from './notes-form';
import { AttendanceForm } from './attendance-form';

export const metadata: Metadata = {
  title: 'Toplantı Detayı',
  robots: { index: false, follow: false },
};

export default async function MentorMeetingDetailPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  const context = await requireAuthContext();

  const meeting = await getMentorMeetingForViewer(context.scope, meetingId);
  if (!meeting) notFound();

  const scopeLabel = meeting.chapterId
    ? (await getChapterById(meeting.chapterId))?.name
    : meeting.programId
      ? (await getProgramById(meeting.programId))?.shortName
      : 'Yönetim Ekibi';
  const canManage = canManageMeeting(context.scope, meeting);

  const [participants, attendance] = await Promise.all([getMeetingParticipants(meeting), listMentorMeetingAttendance(meeting.id)]);
  const attendanceMap = new Map(attendance.map((a) => [a.userId, a.status]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/toplantilar" className="text-sm text-ink-3 hover:text-ink-2">
          ← Mentor Toplantıları
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-ink">{meeting.title}</h1>
        <p className="mt-1 text-sm text-ink-3">
          {scopeLabel} · {meeting.sequence} · {formatDateTimeTr(meeting.startsAt)} — {formatDateTimeTr(meeting.endsAt)}
        </p>
        {meeting.agenda ? <p className="mt-2 text-sm text-ink-2">{meeting.agenda}</p> : null}
      </div>

      <Card>
        <CardTitle>Toplantı Notları</CardTitle>
        <div className="mt-3">
          {canManage ? (
            <NotesForm meeting={meeting} />
          ) : (
            <div className="space-y-3 text-sm text-ink-2">
              <p>{meeting.discussionTopics || 'Henüz not girilmedi.'}</p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardTitle>Katılım</CardTitle>
        <div className="mt-3">
          {canManage ? (
            <AttendanceForm meetingId={meeting.id} mentors={participants} existing={attendanceMap} />
          ) : (
            <ul className="divide-y divide-line-soft text-sm">
              {participants.map((person) => (
                <li key={person.userId} className="flex items-center justify-between py-1.5">
                  <span className="text-ink-2">{person.fullName}</span>
                  <span className="text-ink-3">
                    {attendanceMap.has(person.userId) ? meetingAttendanceLabels[attendanceMap.get(person.userId)!] : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
