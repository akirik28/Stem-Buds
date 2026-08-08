import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import { assignComplaint, getComplaintForViewer, listComplaintsForViewer, setComplaintStatus, submitComplaint } from '@/server/services/complaint-service';
import { createChapter } from '@/server/services/chapter-service';
import { addGroupMember, assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let groupAId: string;
let mentorAId: string;
let studentAId: string;
let headAId: string;

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
  mentorAId = mentorA.userId;
  await assignGroupMentor({ groupId: groupAId, mentorUserId: mentorAId, actor });

  const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
  headAId = head.userId;

  const studentA = await createUser({ username: 'student.a', fullName: 'Student A', role: 'student', chapterId: chapterAId, academicYearId, actor });
  studentAId = studentA.userId;
  await addGroupMember({ groupId: groupAId, userId: studentAId, role: 'student', actor });
});

afterAll(async () => {
  await closeTestDb();
});

describe('submitComplaint', () => {
  it('lets a Student file a complaint about their own chapter, visible to their Chapter Head', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitComplaint({ scope: studentScope, category: 'group_problem', subject: 'Sorun', body: 'Detay', isAnonymous: false, actor });

    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const rows = await listComplaintsForViewer(headScope);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.chapterId).toBe(chapterAId);
    expect(rows[0]?.scope).toBe('chapter');
  });

  it('stores no reporter reference for an anonymous complaint', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitComplaint({ scope: studentScope, category: 'other', subject: 'Anon', body: 'x', isAnonymous: true, actor });

    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const [row] = await listComplaintsForViewer(headScope);
    expect(row?.isAnonymous).toBe(true);
    expect(row?.reporterUserId).toBeNull();
  });

  it('auto-resolves the unambiguous mentor as the target for about_mentor', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'about_mentor', subject: 'x', body: 'y', isAnonymous: false, actor });
    expect(complaint.targetUserId).toBe(mentorAId);
  });

  it('forces scope=executive for about_chapter_head regardless of caller intent, and resolves the target', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'about_chapter_head', subject: 'x', body: 'y', isAnonymous: false, actor });
    expect(complaint.scope).toBe('executive');
    expect(complaint.targetUserId).toBe(headAId);
  });

  it('rejects submission from a non-Student role', async () => {
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      submitComplaint({ scope: mentorScope, category: 'other', subject: 'x', body: 'y', isAnonymous: false, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('complaint privacy invariants', () => {
  it('never lets a Chapter Head see a complaint escalated to executive scope about them', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitComplaint({ scope: studentScope, category: 'about_chapter_head', subject: 'x', body: 'y', isAnonymous: false, actor });

    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    expect(await listComplaintsForViewer(headScope)).toHaveLength(0);
  });

  it('lets Executive Management see a complaint escalated about the Chapter Head', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitComplaint({ scope: studentScope, category: 'about_chapter_head', subject: 'x', body: 'y', isAnonymous: false, actor });

    const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    const rows = await listComplaintsForViewer(execScope);
    expect(rows).toHaveLength(1);
  });

  it('never lets the identified target read a complaint about themselves, even as its own reporter’s Chapter Head', async () => {
    // mentorA is the complaint's target; give mentorA no special access path — sanity: a plain getComplaintForViewer as the mentor's own scope must be null.
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'about_mentor', subject: 'x', body: 'y', isAnonymous: false, actor });

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(await getComplaintForViewer(mentorScope, complaint.id)).toBeNull();
  });

  it('never lets a different chapter’s Chapter Head see the complaint', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    await submitComplaint({ scope: studentScope, category: 'group_problem', subject: 'x', body: 'y', isAnonymous: false, actor });

    const headB = await createUser({ username: 'head.b', fullName: 'Head B', role: 'chapter_head', chapterId: chapterBId, academicYearId, actor });
    const headBScope = await loadAccessScope(headB.userId, 'chapter_head', academicYearId);
    expect(await listComplaintsForViewer(headBScope)).toHaveLength(0);
  });

  it('lets the identified (non-anonymous) reporter see their own complaint', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'group_problem', subject: 'x', body: 'y', isAnonymous: false, actor });
    const result = await getComplaintForViewer(studentScope, complaint.id);
    expect(result).not.toBeNull();
    expect(result?.canSeeReporter).toBe(true);
  });
});

describe('setComplaintStatus', () => {
  it('requires a resolution note before resolving', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'other', subject: 'x', body: 'y', isAnonymous: false, actor });
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);

    await expect(
      setComplaintStatus({ complaintId: complaint.id, status: 'resolved', scope: headScope, actor: { id: headAId, name: 'Head A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');

    const resolved = await setComplaintStatus({
      complaintId: complaint.id,
      status: 'resolved',
      resolutionNote: 'Çözüldü.',
      scope: headScope,
      actor: { id: headAId, name: 'Head A' },
    });
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it('rejects a Chapter Head managing another chapter’s complaint', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'other', subject: 'x', body: 'y', isAnonymous: false, actor });

    const headB = await createUser({ username: 'head.b', fullName: 'Head B', role: 'chapter_head', chapterId: chapterBId, academicYearId, actor });
    const headBScope = await loadAccessScope(headB.userId, 'chapter_head', academicYearId);
    await expect(
      setComplaintStatus({ complaintId: complaint.id, status: 'investigating', scope: headBScope, actor: { id: headB.userId, name: 'Head B' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('assignComplaint', () => {
  it('lets a Chapter Head assign their own chapter’s complaint to themselves', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'other', subject: 'x', body: 'y', isAnonymous: false, actor });
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);

    const updated = await assignComplaint({ complaintId: complaint.id, assigneeUserId: headAId, scope: headScope, actor: { id: headAId, name: 'Head A' } });
    expect(updated.assignedToId).toBe(headAId);
  });

  it('rejects assigning a complaint to a Mentor', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const complaint = await submitComplaint({ scope: studentScope, category: 'other', subject: 'x', body: 'y', isAnonymous: false, actor });
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);

    await expect(
      assignComplaint({ complaintId: complaint.id, assigneeUserId: mentorAId, scope: headScope, actor: { id: headAId, name: 'Head A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});
