import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  canManageMeeting,
  canViewMentorMeetings,
  createExecutiveMeeting,
  createMentorMeeting,
  createProgramMeeting,
  getMeetingParticipants,
  getMentorMeetingForViewer,
  listExecutiveMeetings,
  listMentorMeetings,
  listMyInvitedProgramMeetings,
  listProgramMeetingCandidates,
  listProgramMeetings,
  setMentorMeetingAttendance,
} from '@/server/services/mentor-meeting-service';
import { createChapter } from '@/server/services/chapter-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let bilsemProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let headAId: string;
let mentorAId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
  if (!online || !bilsem) throw new Error('Core programs missing.');
  onlineProgramId = online.id;
  bilsemProgramId = bilsem.id;

  const year = await createAcademicYear({ label: '2026–2027', startDate: '2026-09-01', endDate: '2027-06-30', activate: true, actor });
  academicYearId = year.id;

  const chapterA = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;

  const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
  headAId = head.userId;
  const mentor = await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
  mentorAId = mentor.userId;
});

afterAll(async () => {
  await closeTestDb();
});

describe('createMentorMeeting (chapter-scoped)', () => {
  it('auto-numbers the sequence per chapter/year and lets the Chapter Head create it', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const first = await createMentorMeeting({
      scope: headScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'Ekim Toplantısı',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      actor,
    });
    expect(first.sequence).toBe('Mentor Toplantısı #1');

    const second = await createMentorMeeting({
      scope: headScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'Kasım Toplantısı',
      startsAt: new Date('2026-11-01T18:00:00Z'),
      endsAt: new Date('2026-11-01T19:00:00Z'),
      actor,
    });
    expect(second.sequence).toBe('Mentor Toplantısı #2');
  });

  it('rejects a Chapter Head creating a meeting for another chapter, even with the real id', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      createMentorMeeting({
        scope: headScope,
        chapterId: chapterBId,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a Mentor creating a meeting — they may view, not manage', async () => {
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      createMentorMeeting({
        scope: mentorScope,
        chapterId: chapterAId,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects an end time before the start time', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      createMentorMeeting({
        scope: headScope,
        chapterId: chapterAId,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T19:00:00Z'),
        endsAt: new Date('2026-10-01T18:00:00Z'),
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('canViewMentorMeetings / listMentorMeetings', () => {
  it('lets the chapter’s own Mentor view (but not manage), and never a different chapter’s Mentor', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await createMentorMeeting({
      scope: headScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      actor,
    });

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(canViewMentorMeetings(mentorScope, chapterAId)).toBe(true);
    expect(canViewMentorMeetings(mentorScope, chapterBId)).toBe(false);
    expect(await listMentorMeetings(mentorScope, chapterAId, academicYearId)).toHaveLength(1);
    expect(await listMentorMeetings(mentorScope, chapterBId, academicYearId)).toHaveLength(0);
  });
});

describe('setMentorMeetingAttendance (chapter-scoped)', () => {
  it('rejects recording attendance for a user who is not one of this chapter’s mentors', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const meeting = await createMentorMeeting({
      scope: headScope,
      chapterId: chapterAId,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      actor,
    });

    const outsider = await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: chapterBId, academicYearId, actor });
    await expect(
      setMentorMeetingAttendance({ scope: headScope, meetingId: meeting.id, records: [{ userId: outsider.userId, status: 'present' }], actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('listProgramMeetingCandidates', () => {
  it('never mixes BİLSEM and Online Ortaokul candidates, even though both share this academic year', async () => {
    const bilsemChapter = await createChapter({ programId: bilsemProgramId, code: 'BLC', name: 'BİLSEM Chapter', actor });
    await createUser({ username: 'head.bilsem', fullName: 'Head Bilsem', role: 'chapter_head', chapterId: bilsemChapter.id, academicYearId, actor });

    const onlineCandidates = await listProgramMeetingCandidates(onlineProgramId, academicYearId);
    expect(onlineCandidates.map((c) => c.username)).toEqual(['head.a', 'mentor.a']);

    const bilsemCandidates = await listProgramMeetingCandidates(bilsemProgramId, academicYearId);
    expect(bilsemCandidates.map((c) => c.username)).toEqual(['head.bilsem']);
  });
});

describe('createProgramMeeting', () => {
  it('lets an Executive create a Program meeting with hand-picked participants, auto-numbered per Program', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);

    const meeting = await createProgramMeeting({
      scope: execScope,
      programId: onlineProgramId,
      academicYearId,
      title: 'Online Ortaokul Değerlendirme',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      participantUserIds: [headAId, mentorAId],
      actor,
    });
    expect(meeting.sequence).toBe('Mentor Toplantısı #1');
    expect(meeting.chapterId).toBeNull();
    expect(meeting.programId).toBe(onlineProgramId);

    const participants = await getMeetingParticipants(meeting);
    expect(participants.map((p) => p.userId).sort()).toEqual([headAId, mentorAId].sort());
  });

  it('rejects a non-Executive creating a Program meeting', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      createProgramMeeting({
        scope: headScope,
        programId: onlineProgramId,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        participantUserIds: [mentorAId],
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a participant from the wrong Program, even with a real id, keeping BİLSEM/Ortaokul separate', async () => {
    const bilsemChapter = await createChapter({ programId: bilsemProgramId, code: 'BLC', name: 'BİLSEM Chapter', actor });
    const bilsemMentor = await createUser({ username: 'mentor.bilsem', fullName: 'Mentor Bilsem', role: 'mentor', chapterId: bilsemChapter.id, academicYearId, actor });

    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);

    await expect(
      createProgramMeeting({
        scope: execScope,
        programId: onlineProgramId, // Online Ortaokul meeting...
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        participantUserIds: [bilsemMentor.userId], // ...with a BİLSEM-only mentor.
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects creating with zero participants', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    await expect(
      createProgramMeeting({
        scope: execScope,
        programId: onlineProgramId,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        participantUserIds: [],
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('Program meeting visibility and attendance', () => {
  it('lets an invited Mentor view and appear in their own "invited" list, but not an uninvited Mentor', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const meeting = await createProgramMeeting({
      scope: execScope,
      programId: onlineProgramId,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      participantUserIds: [mentorAId],
      actor,
    });

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await getMentorMeetingForViewer(mentorScope, meeting.id)).not.toBeNull();
    const invited = await listMyInvitedProgramMeetings(mentorScope);
    expect(invited.map((m) => m.id)).toEqual([meeting.id]);

    const otherMentor = await createUser({ username: 'mentor.c', fullName: 'Mentor C', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
    const otherScope = await loadAccessScope(otherMentor.userId, 'mentor', academicYearId);
    expect(await getMentorMeetingForViewer(otherScope, meeting.id)).toBeNull();
    expect(await listMyInvitedProgramMeetings(otherScope)).toHaveLength(0);
  });

  it('rejects recording attendance for someone who was never invited to the Program meeting', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const meeting = await createProgramMeeting({
      scope: execScope,
      programId: onlineProgramId,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      participantUserIds: [mentorAId],
      actor,
    });

    const otherMentor = await createUser({ username: 'mentor.c', fullName: 'Mentor C', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
    await expect(
      setMentorMeetingAttendance({ scope: execScope, meetingId: meeting.id, records: [{ userId: otherMentor.userId, status: 'present' }], actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a Chapter Head managing a Program meeting — only Executive may', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const meeting = await createProgramMeeting({
      scope: execScope,
      programId: onlineProgramId,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      participantUserIds: [headAId],
      actor,
    });

    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      setMentorMeetingAttendance({ scope: headScope, meetingId: meeting.id, records: [{ userId: headAId, status: 'present' }], actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('listProgramMeetings', () => {
  it('only Executive may list a Program’s meetings', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    await createProgramMeeting({
      scope: execScope,
      programId: onlineProgramId,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      participantUserIds: [mentorAId],
      actor,
    });

    expect(await listProgramMeetings(execScope, onlineProgramId, academicYearId)).toHaveLength(1);
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await listProgramMeetings(mentorScope, onlineProgramId, academicYearId)).toHaveLength(0);
  });
});

describe('createExecutiveMeeting', () => {
  it('auto-populates attendance with every current Regional Director/Vice President — never hand-picked, never a Mentor', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const vicePresident = await createUser({ username: 'vp.test', fullName: 'VP', role: 'vice_president', actor });

    const meeting = await createExecutiveMeeting({
      scope: execScope,
      academicYearId,
      title: 'Aylık Yönetim Toplantısı',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      actor,
    });

    expect(meeting.chapterId).toBeNull();
    expect(meeting.programId).toBeNull();
    expect(meeting.sequence).toBe('Yönetim Toplantısı #1');

    const participants = await getMeetingParticipants(meeting);
    expect(participants.map((p) => p.userId).sort()).toEqual([director.userId, vicePresident.userId].sort());
    expect(participants.map((p) => p.userId)).not.toContain(mentorAId);
    expect(participants.map((p) => p.userId)).not.toContain(headAId);
  });

  it('numbers a second Executive meeting #2, independently of Program-meeting numbering in the same year', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);

    const programMeeting = await createProgramMeeting({
      scope: execScope,
      programId: onlineProgramId,
      academicYearId,
      title: 'Program toplantısı',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      participantUserIds: [mentorAId],
      actor,
    });
    const execMeeting1 = await createExecutiveMeeting({
      scope: execScope,
      academicYearId,
      title: 'Yönetim 1',
      startsAt: new Date('2026-10-02T18:00:00Z'),
      endsAt: new Date('2026-10-02T19:00:00Z'),
      actor,
    });
    const execMeeting2 = await createExecutiveMeeting({
      scope: execScope,
      academicYearId,
      title: 'Yönetim 2',
      startsAt: new Date('2026-10-03T18:00:00Z'),
      endsAt: new Date('2026-10-03T19:00:00Z'),
      actor,
    });

    expect(programMeeting.sequence).toBe('Mentor Toplantısı #1');
    expect(execMeeting1.sequence).toBe('Yönetim Toplantısı #1');
    expect(execMeeting2.sequence).toBe('Yönetim Toplantısı #2');
  });

  it('rejects a non-Executive creating a Yönetim Toplantısı', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await expect(
      createExecutiveMeeting({
        scope: headScope,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      createExecutiveMeeting({
        scope: mentorScope,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T18:00:00Z'),
        endsAt: new Date('2026-10-01T19:00:00Z'),
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects an end time at or before the start time', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    await expect(
      createExecutiveMeeting({
        scope: execScope,
        academicYearId,
        title: 'x',
        startsAt: new Date('2026-10-01T19:00:00Z'),
        endsAt: new Date('2026-10-01T18:00:00Z'),
        actor,
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('listExecutiveMeetings', () => {
  it('only an Executive may list Yönetim Toplantısı meetings', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    await createExecutiveMeeting({
      scope: execScope,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      actor,
    });

    expect(await listExecutiveMeetings(execScope, academicYearId)).toHaveLength(1);
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await listExecutiveMeetings(mentorScope, academicYearId)).toHaveLength(0);
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    expect(await listExecutiveMeetings(headScope, academicYearId)).toHaveLength(0);
  });

  it('never mixes chapter- or Program-scoped meetings into the Executive list', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);

    await createMentorMeeting({ scope: headScope, chapterId: chapterAId, academicYearId, title: 'chapter', startsAt: new Date('2026-10-01T18:00:00Z'), endsAt: new Date('2026-10-01T19:00:00Z'), actor });
    await createProgramMeeting({ scope: execScope, programId: onlineProgramId, academicYearId, title: 'program', startsAt: new Date('2026-10-01T18:00:00Z'), endsAt: new Date('2026-10-01T19:00:00Z'), participantUserIds: [mentorAId], actor });

    expect(await listExecutiveMeetings(execScope, academicYearId)).toHaveLength(0);
  });
});

describe('Executive meeting visibility and management', () => {
  it('a Mentor (never a participant) cannot view a Yönetim Toplantısı; an Executive can', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const meeting = await createExecutiveMeeting({
      scope: execScope,
      academicYearId,
      title: 'x',
      startsAt: new Date('2026-10-01T18:00:00Z'),
      endsAt: new Date('2026-10-01T19:00:00Z'),
      actor,
    });

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await getMentorMeetingForViewer(mentorScope, meeting.id)).toBeNull();
    expect(await getMentorMeetingForViewer(execScope, meeting.id)).not.toBeNull();
    expect(canManageMeeting(execScope, meeting)).toBe(true);
    expect(canManageMeeting(mentorScope, meeting)).toBe(false);
  });
});
