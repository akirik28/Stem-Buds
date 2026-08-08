import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildChapterWorkbook, buildOrganizationWorkbook } from '@/server/services/export-service';
import { createChapter, archiveChapter } from '@/server/services/chapter-service';
import { addGroupMember, assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { finalizeAttendance, setHomeworkDecision, updateWorkLogNarrative, approveWeeklySession } from '@/server/services/weekly-work-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let groupAId: string;
let studentMembershipId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core programs missing.');
  onlineProgramId = online.id;

  const year = await createAcademicYear({ label: '2026–2027', startDate: '2026-09-01', endDate: '2027-06-30', activate: true, actor });
  academicYearId = year.id;

  const chapterA = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;

  const groupA = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'bio', actor });
  groupAId = groupA.id;
  const mentorA = await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
  await assignGroupMentor({ groupId: groupAId, mentorUserId: mentorA.userId, actor });
  const studentA = await createUser({ username: 'student.a', fullName: 'Student A', role: 'student', chapterId: chapterAId, academicYearId, actor });
  const membership = await addGroupMember({ groupId: groupAId, userId: studentA.userId, role: 'student', actor });
  studentMembershipId = membership.id;

  const { updateProgramSchedule } = await import('@/server/services/program-service');
  await updateProgramSchedule({ programId: onlineProgramId, weeklyDayOfWeek: 6, weeklyStartMinute: 18 * 60, weeklyDurationMinutes: 60, actor });

  // Chapter B has its own group/mentor/student, entirely separate.
  const groupB = await createGroup({ chapterId: chapterBId, academicYearId, disciplineKey: 'cs', actor });
  const mentorB = await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: chapterBId, academicYearId, actor });
  await assignGroupMentor({ groupId: groupB.id, mentorUserId: mentorB.userId, actor });
});

afterAll(async () => {
  await closeTestDb();
});

function sheetRows(sheet: ReturnType<Awaited<ReturnType<typeof buildChapterWorkbook>>['getWorksheet']>): string[][] {
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    rows.push((row.values as unknown[]).slice(1).map((v) => String(v ?? '')));
  });
  return rows;
}

describe('buildChapterWorkbook', () => {
  it('includes the Group/member/attendance/homework sheets scoped strictly to that chapter', async () => {
    await generateWeeklySessionsForGroup(groupAId);
    const [session1] = await listWeeklySessionsByGroup(groupAId);
    if (!session1) throw new Error('No session.');
    await finalizeAttendance({ weeklySessionId: session1.id, records: [{ groupMembershipId: studentMembershipId, status: 'present' }], actor });
    await updateWorkLogNarrative({ weeklySessionId: session1.id, whatWeDid: 'x', nextWeekGoal: 'y', projectHealth: 'on_track', actor });
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });

    const workbook = await buildChapterWorkbook(chapterAId, academicYearId);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(['Gruplar', 'Üyeler', 'Katılım Özeti', 'Ödev Özeti']);

    const groupsSheet = sheetRows(workbook.getWorksheet('Gruplar'));
    expect(groupsSheet[0]).toEqual(['Grup', 'Alan', 'Mentor', 'Üye Sayısı', 'Proje', 'Proje Sağlığı']);
    expect(groupsSheet.some((r) => r.includes('Bio 1'))).toBe(true);
    // Chapter B's group must never appear in Chapter A's export.
    expect(groupsSheet.some((r) => r.includes('CS 1'))).toBe(false);

    const membersSheet = sheetRows(workbook.getWorksheet('Üyeler'));
    expect(membersSheet.some((r) => r.includes('Mentor B'))).toBe(false);
    expect(membersSheet.some((r) => r.includes('Student A'))).toBe(true);

    const attendanceSheet = sheetRows(workbook.getWorksheet('Katılım Özeti'));
    expect(attendanceSheet.some((r) => r[0] === 'Student A' && r[4] === '100%')).toBe(true);
  });
});

describe('buildOrganizationWorkbook', () => {
  it('produces per-chapter sheets for every active chapter, and none for an archived one', async () => {
    const chapterC = await createChapter({ programId: onlineProgramId, code: 'ARC', name: 'Archived Chapter', actor });
    await archiveChapter({ id: chapterC.id, actor });

    const workbook = await buildOrganizationWorkbook(academicYearId);
    const names = workbook.worksheets.map((s) => s.name);
    expect(names.some((n) => n.includes('Chapter A'))).toBe(true);
    expect(names.some((n) => n.includes('Chapter B'))).toBe(true);
    expect(names.some((n) => n.includes('Archived Chapter'))).toBe(false);
  });
});
