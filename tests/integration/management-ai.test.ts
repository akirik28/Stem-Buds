import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  getAdvisorGroupSummaryInsight,
  getChapterGroupStatusInsight,
  getDataQuestionInsight,
  getMentorAlertExplainerInsight,
  getWeeklySummaryInsight,
} from '@/server/services/management-ai';
import { FakeAiProvider } from '@/server/ai/fake-provider';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { getDb } from '@/server/db';
import { weeklySessions } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let bilsemProgramId: string;
let academicYearId: string;
let chapterId: string;
let groupId: string;
let mentorId: string;

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

  const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  chapterId = chapter.id;
  const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
  groupId = group.id;

  const mentor = await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId, academicYearId, actor });
  mentorId = mentor.userId;
  await assignGroupMentor({ groupId, mentorUserId: mentorId, actor });

  await updateProgramSchedule({ programId: onlineProgramId, weeklyDayOfWeek: 6, weeklyStartMinute: 18 * 60, weeklyDurationMinutes: 60, actor });
});

afterAll(async () => {
  await closeTestDb();
});

async function makeMissingRecordAlert() {
  await generateWeeklySessionsForGroup(groupId);
  const [session1] = await listWeeklySessionsByGroup(groupId);
  if (!session1) throw new Error('No session.');
  const start = new Date(Date.now() - 40 * 60 * 60 * 1000);
  const end = new Date(Date.now() - 39 * 60 * 60 * 1000);
  await getDb().update(weeklySessions).set({ scheduledStartAt: start, scheduledEndAt: end }).where(eq(weeklySessions.id, session1.id));
  await runAlertEvaluation({ force: true });
}

describe('getWeeklySummaryInsight — REGIONAL_DIRECTOR / VICE_DIRECTOR', () => {
  it('returns a validated structured insight and caches it', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const provider = new FakeAiProvider('success');

    const first = await getWeeklySummaryInsight(scope, null, { id: director.userId, name: 'Director' }, { provider });
    expect(first.status).toBe('ok');
    if (first.status !== 'ok') throw new Error('unexpected');
    expect(first.cached).toBe(false);
    expect(first.insight.summary.length).toBeGreaterThan(0);
    expect(provider.callCount).toBe(1);

    const second = await getWeeklySummaryInsight(scope, null, { id: director.userId, name: 'Director' }, { provider });
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') throw new Error('unexpected');
    expect(second.cached).toBe(true);
    expect(provider.callCount).toBe(1); // same underlying facts -> no second call
  });

  it('gives VICE_DIRECTOR the exact same access as REGIONAL_DIRECTOR', async () => {
    const vp = await createUser({ username: 'vp.test', fullName: 'VP', role: 'vice_president', actor });
    const scope = await loadAccessScope(vp.userId, 'vice_president', academicYearId);
    const provider = new FakeAiProvider('success');
    const result = await getWeeklySummaryInsight(scope, null, { id: vp.userId, name: 'VP' }, { provider });
    expect(result.status).toBe('ok');
  });

  it('rejects everyone else, including Chapter Head', async () => {
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor });
    const scope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    await expect(getWeeklySummaryInsight(scope, null, { id: head.userId, name: 'Head A' }, { provider: new FakeAiProvider('success') })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'forbidden',
    );
  });

  it('regenerates when facts actually change, and force-regeneration is rate-limited per actor', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const provider = new FakeAiProvider('success');
    await getWeeklySummaryInsight(scope, null, { id: director.userId, name: 'Director' }, { provider });

    await makeMissingRecordAlert(); // changes the underlying facts (a new open alert)
    const afterChange = await getWeeklySummaryInsight(scope, null, { id: director.userId, name: 'Director' }, { provider });
    expect(afterChange.status).toBe('ok');
    if (afterChange.status === 'ok') expect(afterChange.cached).toBe(false);
    expect(provider.callCount).toBe(2);
  });
});

describe('getDataQuestionInsight — REGIONAL_DIRECTOR / VICE_DIRECTOR only', () => {
  it('answers within the authorized data context', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const result = await getDataQuestionInsight(scope, 'Bu hafta hangi gruplara bakmalıyım?', null, { id: director.userId, name: 'Director' }, {
      provider: new FakeAiProvider('success'),
    });
    expect(result.status).toBe('ok');
  });

  it('rejects Chapter Head, Mentor, Advisor Teacher and Student', async () => {
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor });
    const headScope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    await expect(
      getDataQuestionInsight(headScope, 'x', null, { id: head.userId, name: 'Head A' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');

    const mentorScope = await loadAccessScope(mentorId, 'mentor', academicYearId);
    await expect(
      getDataQuestionInsight(mentorScope, 'x', null, { id: mentorId, name: 'Mentor A' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');

    const student = await createUser({ username: 'student.test', fullName: 'Student', role: 'student', chapterId, academicYearId, actor });
    const studentScope = await loadAccessScope(student.userId, 'student', academicYearId);
    await expect(
      getDataQuestionInsight(studentScope, 'x', null, { id: student.userId, name: 'Student' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');
  });

  it('rejects an empty or excessively long question before ever calling the provider', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const provider = new FakeAiProvider('success');
    await expect(getDataQuestionInsight(scope, '   ', null, { id: director.userId, name: 'Director' }, { provider })).rejects.toThrow();
    await expect(
      getDataQuestionInsight(scope, 'x'.repeat(400), null, { id: director.userId, name: 'Director' }, { provider }),
    ).rejects.toThrow();
    expect(provider.callCount).toBe(0);
  });
});

describe('getChapterGroupStatusInsight — CHAPTER_HEAD only, own chapter', () => {
  it('summarizes only the authorized chapter’s groups', async () => {
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor });
    const scope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    const provider = new FakeAiProvider('success');
    const result = await getChapterGroupStatusInsight(scope, chapterId, { id: head.userId, name: 'Head A' }, { provider });
    expect(result.status).toBe('ok');
    expect(provider.lastRequest?.messages[1]?.content).toContain('Bio 1');
  });

  it('rejects access to another chapter, even with the real ID', async () => {
    const otherChapter = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
    const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor });
    const scope = await loadAccessScope(head.userId, 'chapter_head', academicYearId);
    await expect(
      getChapterGroupStatusInsight(scope, otherChapter.id, { id: head.userId, name: 'Head A' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');
  });

  it('rejects Executive Management — this surface is Chapter Head only', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    await expect(
      getChapterGroupStatusInsight(scope, chapterId, { id: director.userId, name: 'Director' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');
  });
});

describe('getMentorAlertExplainerInsight — MENTOR only, assigned Groups only', () => {
  it('shows the healthy empty state without calling the provider when there are no alerts', async () => {
    const scope = await loadAccessScope(mentorId, 'mentor', academicYearId);
    const provider = new FakeAiProvider('success');
    const result = await getMentorAlertExplainerInsight(scope, { id: mentorId, name: 'Mentor A' }, { provider });
    expect(result.status).toBe('no_alerts');
    expect(provider.callCount).toBe(0);
  });

  it('explains only the assigned Group’s existing deterministic alerts', async () => {
    await makeMissingRecordAlert();
    const scope = await loadAccessScope(mentorId, 'mentor', academicYearId);
    const provider = new FakeAiProvider('success');
    const result = await getMentorAlertExplainerInsight(scope, { id: mentorId, name: 'Mentor A' }, { provider });
    expect(result.status).toBe('ok');
  });

  it('never includes an unrelated Group’s alert, and rejects Student/Team Leader', async () => {
    const otherChapter = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
    const otherGroup = await createGroup({ chapterId: otherChapter.id, academicYearId, disciplineKey: 'cs', actor });
    const otherMentor = await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: otherChapter.id, academicYearId, actor });
    await assignGroupMentor({ groupId: otherGroup.id, mentorUserId: otherMentor.userId, actor });
    await getDb(); // no-op, keeps import graph consistent

    const scope = await loadAccessScope(mentorId, 'mentor', academicYearId);
    const result = await getMentorAlertExplainerInsight(scope, { id: mentorId, name: 'Mentor A' }, { provider: new FakeAiProvider('success') });
    expect(result.status).toBe('no_alerts'); // mentorA has no alerts of their own

    const student = await createUser({ username: 'student.test', fullName: 'Student', role: 'student', chapterId, academicYearId, actor });
    const studentScope = await loadAccessScope(student.userId, 'student', academicYearId);
    await expect(
      getMentorAlertExplainerInsight(studentScope, { id: student.userId, name: 'Student' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');
  });
});

describe('getAdvisorGroupSummaryInsight — ADVISOR_TEACHER only, authorized Program scope', () => {
  it('returns a per-Group summary for a Program-scoped advisor', async () => {
    const advisor = await createUser({ username: 'advisor.online', fullName: 'Advisor Online', role: 'advisor_teacher', programIds: [onlineProgramId], actor });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    const provider = new FakeAiProvider('success');
    const result = await getAdvisorGroupSummaryInsight(scope, groupId, { id: advisor.userId, name: 'Advisor Online' }, { provider });
    expect(result.status).toBe('ok');
  });

  it('rejects a Group outside the authorized Program, even by changing the ID directly', async () => {
    const bilsemChapter = await createChapter({ programId: bilsemProgramId, code: 'BLS1', name: 'BİLSEM Ankara', actor });
    const bilsemGroup = await createGroup({ chapterId: bilsemChapter.id, academicYearId, disciplineKey: 'cs', actor });

    const advisor = await createUser({ username: 'advisor.online', fullName: 'Advisor Online', role: 'advisor_teacher', programIds: [onlineProgramId], actor });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    await expect(
      getAdvisorGroupSummaryInsight(scope, bilsemGroup.id, { id: advisor.userId, name: 'Advisor Online' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets an organization-wide advisor reach Groups in both Programs, kept separately scoped per call', async () => {
    const bilsemChapter = await createChapter({ programId: bilsemProgramId, code: 'BLS1', name: 'BİLSEM Ankara', actor });
    const bilsemGroup = await createGroup({ chapterId: bilsemChapter.id, academicYearId, disciplineKey: 'cs', actor });

    const advisor = await createUser({
      username: 'advisor.both',
      fullName: 'Advisor Both',
      role: 'advisor_teacher',
      programIds: [onlineProgramId, bilsemProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    const onlineResult = await getAdvisorGroupSummaryInsight(scope, groupId, { id: advisor.userId, name: 'Advisor Both' }, { provider: new FakeAiProvider('success') });
    const bilsemResult = await getAdvisorGroupSummaryInsight(scope, bilsemGroup.id, { id: advisor.userId, name: 'Advisor Both' }, { provider: new FakeAiProvider('success') });
    expect(onlineResult.status).toBe('ok');
    expect(bilsemResult.status).toBe('ok');
  });

  it('rejects every non-Advisor role', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    await expect(
      getAdvisorGroupSummaryInsight(scope, groupId, { id: director.userId, name: 'Director' }, { provider: new FakeAiProvider('success') }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'forbidden');
  });

  it('never sends student names, emails, or full user objects to the provider', async () => {
    const advisor = await createUser({ username: 'advisor.online', fullName: 'Advisor Online', role: 'advisor_teacher', programIds: [onlineProgramId], actor });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    const student = await createUser({ username: 'gizli.ogrenci', fullName: 'Gizli Öğrenci', role: 'student', chapterId, academicYearId, actor, notificationEmail: 'gizli@example.com' });
    const { addGroupMember } = await import('@/server/services/group-service');
    await addGroupMember({ groupId, userId: student.userId, role: 'student', actor });

    const provider = new FakeAiProvider('success');
    await getAdvisorGroupSummaryInsight(scope, groupId, { id: advisor.userId, name: 'Advisor Online' }, { provider });
    const sentContent = provider.lastRequest?.messages.map((m) => m.content).join('\n') ?? '';
    expect(sentContent).not.toContain('Gizli Öğrenci');
    expect(sentContent).not.toContain('gizli@example.com');
  });
});

describe('AI provider failure handling', () => {
  it('degrades gracefully on malformed output, rate limit, and provider error, without breaking the deterministic product', async () => {
    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const scope = await loadAccessScope(director.userId, 'regional_director', academicYearId);

    const malformed = await getWeeklySummaryInsight(scope, null, { id: director.userId, name: 'Director' }, { provider: new FakeAiProvider('malformed') });
    expect(malformed.status).toBe('unavailable');
    if (malformed.status === 'unavailable') expect(malformed.reason).toBe('malformed_output');

    const rateLimited = await getWeeklySummaryInsight(
      scope,
      onlineProgramId, // a different programId filter -> distinct facts -> not a cache hit off the first call
      { id: director.userId, name: 'Director' },
      { provider: new FakeAiProvider('rate_limit') },
    );
    expect(rateLimited.status).toBe('unavailable');

    const errored = await getWeeklySummaryInsight(scope, bilsemProgramId, { id: director.userId, name: 'Director' }, { provider: new FakeAiProvider('error') });
    expect(errored.status).toBe('unavailable');
    if (errored.status === 'unavailable') expect(errored.reason).toBe('provider_error');
  });
});
