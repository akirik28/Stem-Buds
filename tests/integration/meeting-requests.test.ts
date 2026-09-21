import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  createMentorMeeting,
  decideMeetingRequest,
  listMentorMeetings,
  listPendingMeetingRequests,
  requestMentorMeeting,
} from '@/server/services/mentor-meeting-service';
import { createChapter } from '@/server/services/chapter-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';
import { futureAcademicYearWindow } from '../helpers/academic-year';

/**
 * A Mentor may not schedule a meeting but may ask for one; the Chapter Head
 * decides. The boundary that matters is that a request must not behave like
 * a meeting until it is approved — it has no agreed slot in anyone's week.
 */

const actor = { id: null, name: 'test-suite' };

let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let headAId: string;
let mentorAId: string;
let mentorBId: string;

const at = (hoursFromNow: number): Date => new Date(Date.now() + hoursFromNow * 3_600_000);

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core program missing.');

  const year = await createAcademicYear({ ...futureAcademicYearWindow(), activate: true, actor });
  academicYearId = year.id;

  const chapterA = await createChapter({ programId: online.id, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: online.id, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;

  headAId = (
    await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor })
  ).userId;
  mentorAId = (
    await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId: chapterAId, academicYearId, actor })
  ).userId;
  mentorBId = (
    await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: chapterBId, academicYearId, actor })
  ).userId;
});

afterAll(async () => {
  await closeTestDb();
});

describe('requesting a meeting', () => {
  it('lets a Mentor of the chapter request one, and keeps it out of the meeting list until approved', async () => {
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const request = await requestMentorMeeting({
      scope: mentorScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'Bio 1 ilerlemesi',
      startsAt: at(48),
      endsAt: at(49),
      requestNote: 'Projede tıkandık.',
      actor: { id: mentorAId, name: 'Mentor A' },
    });

    expect(request.requestStatus).toBe('pending');
    expect(request.requestedById).toBe(mentorAId);
    expect(request.sequence).toContain('Toplantı Talebi');

    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    expect(await listMentorMeetings(headScope, chapterAId, academicYearId)).toHaveLength(0);
    expect(await listPendingMeetingRequests(headScope, chapterAId, academicYearId)).toHaveLength(1);
  });

  it('refuses a Mentor who does not belong to that chapter', async () => {
    const outsider = await loadAccessScope(mentorBId, 'mentor', academicYearId);
    await expect(
      requestMentorMeeting({
        scope: outsider,
        chapterId: chapterAId,
        academicYearId,
        title: 'Başka chapter',
        startsAt: at(48),
        endsAt: at(49),
        actor: { id: mentorBId, name: 'Mentor B' },
      }),
    ).rejects.toSatisfy(isAppError);
  });

  it('refuses a Chapter Head — they create meetings directly, they do not request them', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      requestMentorMeeting({
        scope: headScope,
        chapterId: chapterAId,
        academicYearId,
        title: 'Head talebi',
        startsAt: at(48),
        endsAt: at(49),
        actor: { id: headAId, name: 'Head A' },
      }),
    ).rejects.toSatisfy(isAppError);
  });
});

describe('deciding a request', () => {
  async function pendingRequest() {
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    return requestMentorMeeting({
      scope: mentorScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'Bio 1 ilerlemesi',
      startsAt: at(48),
      endsAt: at(49),
      actor: { id: mentorAId, name: 'Mentor A' },
    });
  }

  it('turns an approved request into a real meeting carrying its video link', async () => {
    const request = await pendingRequest();
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);

    const decided = await decideMeetingRequest({
      scope: headScope,
      meetingId: request.id,
      decision: 'approved',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      actor: { id: headAId, name: 'Head A' },
    });

    expect(decided.requestStatus).toBe('approved');
    expect(decided.meetingUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(decided.sequence).toContain('Mentor Toplantısı');
    expect(decided.decidedById).toBe(headAId);
    expect(decided.decidedAt).not.toBeNull();

    expect(await listMentorMeetings(headScope, chapterAId, academicYearId)).toHaveLength(1);
    expect(await listPendingMeetingRequests(headScope, chapterAId, academicYearId)).toHaveLength(0);
  });

  it('keeps a declined request out of the meeting list and attaches no link', async () => {
    const request = await pendingRequest();
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);

    const decided = await decideMeetingRequest({
      scope: headScope,
      meetingId: request.id,
      decision: 'declined',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      actor: { id: headAId, name: 'Head A' },
    });

    expect(decided.requestStatus).toBe('declined');
    expect(decided.meetingUrl).toBeNull();
    expect(await listMentorMeetings(headScope, chapterAId, academicYearId)).toHaveLength(0);
  });

  it('refuses a second decision on the same request', async () => {
    const request = await pendingRequest();
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await decideMeetingRequest({ scope: headScope, meetingId: request.id, decision: 'approved', actor: { id: headAId, name: 'Head A' } });

    await expect(
      decideMeetingRequest({ scope: headScope, meetingId: request.id, decision: 'declined', actor: { id: headAId, name: 'Head A' } }),
    ).rejects.toSatisfy(isAppError);
  });

  it('refuses the requesting Mentor deciding their own request', async () => {
    const request = await pendingRequest();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      decideMeetingRequest({ scope: mentorScope, meetingId: request.id, decision: 'approved', actor: { id: mentorAId, name: 'Mentor A' } }),
    ).rejects.toSatisfy(isAppError);
  });

  it('rejects a link that is not an http(s) URL', async () => {
    const request = await pendingRequest();
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      decideMeetingRequest({
        scope: headScope,
        meetingId: request.id,
        decision: 'approved',
        meetingUrl: 'meet.google.com/abc',
        actor: { id: headAId, name: 'Head A' },
      }),
    ).rejects.toSatisfy(isAppError);
  });
});

describe('directly created meetings', () => {
  it('are approved from birth, so the request workflow never hides them', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const meeting = await createMentorMeeting({
      scope: headScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'Haftalık mentor toplantısı',
      startsAt: at(24),
      endsAt: at(25),
      actor: { id: headAId, name: 'Head A' },
    });

    expect(meeting.requestStatus).toBe('approved');
    expect(await listMentorMeetings(headScope, chapterAId, academicYearId)).toHaveLength(1);
  });
});
