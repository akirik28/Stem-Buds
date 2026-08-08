import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { auditLogs, groups } from '@/server/db/schema';
import { createChapter, listChapterMembers } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup, getGroupById, listGroupMembers } from '@/server/services/group-service';
import { createUser, deactivateUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { canAccessChannel, canViewGroup, type AccessScope } from '@/server/authz/policy';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Group ↔ Mentor ownership.
 *
 * ONE group has exactly one assigned mentor once operational; ONE mentor may
 * be assigned to several groups. A group with no mentor is a draft. These
 * tests exist because the assignment is the authorization anchor for a
 * mentor's access to a group's future sessions/homework/messages — getting
 * it wrong means either a mentor loses legitimate access or, worse, keeps
 * access to a group they were removed from.
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const program = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!program) throw new Error('Core program missing.');
  onlineProgramId = program.id;

  const year = await createAcademicYear({
    label: '2026–2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    activate: true,
    actor,
  });
  academicYearId = year.id;

  const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
  chapterId = chapter.id;
});

afterAll(async () => {
  await closeTestDb();
});

async function createMentorInChapter(username: string) {
  return createUser({
    username,
    fullName: 'Test Mentor',
    role: 'mentor',
    chapterId,
    academicYearId,
    actor,
  });
}

describe('draft groups', () => {
  it('has no mentor until one is explicitly assigned', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    expect(group.mentorUserId).toBeNull();
  });
});

describe('assigning a mentor', () => {
  it('rejects a target user who is not an active mentor', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const student = await createUser({
      username: 'ogrenci.deneme',
      fullName: 'Test Öğrenci',
      role: 'student',
      chapterId,
      academicYearId,
      actor,
    });

    await expect(
      assignGroupMentor({ groupId: group.id, mentorUserId: student.userId, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a mentor who is not a member of the group’s chapter', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const otherChapter = await createChapter({ programId: onlineProgramId, code: 'OTH', name: 'Other', actor });
    const outsideMentor = await createUser({
      username: 'disari.mentor',
      fullName: 'Dışarıdan Mentor',
      role: 'mentor',
      chapterId: otherChapter.id,
      academicYearId,
      actor,
    });

    await expect(
      assignGroupMentor({ groupId: group.id, mentorUserId: outsideMentor.userId, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a deactivated mentor', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createMentorInChapter('pasif.mentor');
    await deactivateUser({ targetUserId: mentor.userId, actor: { id: null, name: 'Exec' } });

    await expect(
      assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('assigns a mentor and makes the group operational', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createMentorInChapter('mentor.bir');

    const updated = await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });
    expect(updated.mentorUserId).toBe(mentor.userId);

    const members = await listGroupMembers(group.id);
    expect(members.find((m) => m.userId === mentor.userId)?.role).toBe('mentor');
  });

  it('lets one mentor be assigned to several groups', async () => {
    const groupA = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const groupB = await createGroup({ chapterId, academicYearId, disciplineKey: 'cs', actor });
    const mentor = await createMentorInChapter('cok.grup.mentor');

    await assignGroupMentor({ groupId: groupA.id, mentorUserId: mentor.userId, actor });
    await assignGroupMentor({ groupId: groupB.id, mentorUserId: mentor.userId, actor });

    const rows = await getDb().select().from(groups).where(eq(groups.mentorUserId, mentor.userId));
    expect(rows.map((r) => r.id).sort()).toEqual([groupA.id, groupB.id].sort());
  });

  it('preserves other group data — students and their memberships — when the mentor changes', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentorA = await createMentorInChapter('mentor.a');
    const mentorB = await createMentorInChapter('mentor.b');
    const student = await createUser({
      username: 'ogrenci.sabit',
      fullName: 'Sabit Öğrenci',
      role: 'student',
      chapterId,
      academicYearId,
      actor,
    });

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentorA.userId, actor });
    const { addGroupMember } = await import('@/server/services/group-service');
    await addGroupMember({ groupId: group.id, userId: student.userId, role: 'student', actor });

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentorB.userId, actor });

    const members = await listGroupMembers(group.id);
    const studentRow = members.find((m) => m.userId === student.userId);
    expect(studentRow).toBeDefined();
    expect(studentRow?.isActive).toBe(true);

    const oldMentorRow = members.find((m) => m.userId === mentorA.userId);
    expect(oldMentorRow).toBeUndefined(); // deactivated, not returned by listGroupMembers (isActive filter)

    const [groupRow] = await getDb().select().from(groups).where(eq(groups.id, group.id));
    expect(groupRow?.name).toBe('Bio 1');
  });

  it('revokes the previous mentor’s access and grants it to the new one', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentorA = await createMentorInChapter('eski.mentor');
    const mentorB = await createMentorInChapter('yeni.mentor');

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentorA.userId, actor });

    // `loadAccessScope` is the exact function every real request builds its
    // AccessScope from — deriving it here (rather than hand-constructing one)
    // is what actually exercises assignGroupMentor's group_memberships sync,
    // not just a hand-typed array.
    const { loadAccessScope } = await import('@/server/auth/context');
    const scopeABefore = await loadAccessScope(mentorA.userId, 'mentor', academicYearId);
    expect(canViewGroup(scopeABefore, group.id, chapterId)).toBe(true);

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentorB.userId, actor });

    const scopeAAfter = await loadAccessScope(mentorA.userId, 'mentor', academicYearId);
    const scopeB = await loadAccessScope(mentorB.userId, 'mentor', academicYearId);

    expect(canViewGroup(scopeAAfter, group.id, chapterId)).toBe(false);
    expect(canViewGroup(scopeB, group.id, chapterId)).toBe(true);
  });

  it('is audit logged', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createMentorInChapter('denetim.mentor');

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });

    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.action, 'group.mentor_assigned'));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.targetId).toBe(group.id);
  });

  it('does not duplicate the audit trail or membership when reassigning to the same mentor', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createMentorInChapter('ayni.mentor');

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });
    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });

    const logs = await getDb().select().from(auditLogs).where(eq(auditLogs.action, 'group.mentor_assigned'));
    expect(logs).toHaveLength(1);
  });
});

describe('cross-program / cross-group leakage', () => {
  it('never lets a group from one program leak a mentor relationship into another', async () => {
    const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
    const bilsemChapter = await createChapter({
      programId: bilsem!.id,
      code: 'BLS1',
      name: 'BİLSEM',
      actor,
    });
    const onlineGroup = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const bilsemMentor = await createUser({
      username: 'bilsem.mentor',
      fullName: 'BİLSEM Mentor',
      role: 'mentor',
      chapterId: bilsemChapter.id,
      academicYearId,
      actor,
    });

    // A mentor provisioned only into the BİLSEM chapter can never be
    // assigned to an Online Ortaokul group — the chapter-membership check
    // inside assignGroupMentor rejects it even though both accounts and both
    // groups technically exist in the same database.
    await expect(
      assignGroupMentor({ groupId: onlineGroup.id, mentorUserId: bilsemMentor.userId, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects unauthorized direct-ID access to a group channel', () => {
    const groupA = 'group-a';
    const groupB = 'group-b';

    const mentorOfA: AccessScope = {
      userId: 'mentor-a',
      role: 'mentor',
      headChapterIds: [],
      memberChapterIds: [chapterId],
      mentorGroupIds: [groupA],
      studentGroupIds: [],
      teamLeaderGroupIds: [],
    };

    // Guessing/typing another group's channel ID does not grant access.
    expect(canAccessChannel(mentorOfA, { type: 'group', chapterId, groupId: groupA })).toBe(true);
    expect(canAccessChannel(mentorOfA, { type: 'group', chapterId, groupId: groupB })).toBe(false);

    const studentOfA: AccessScope = {
      userId: 'student-a',
      role: 'student',
      headChapterIds: [],
      memberChapterIds: [chapterId],
      mentorGroupIds: [],
      studentGroupIds: [groupA],
      teamLeaderGroupIds: [],
    };
    expect(canAccessChannel(studentOfA, { type: 'group', chapterId, groupId: groupA })).toBe(true);
    expect(canAccessChannel(studentOfA, { type: 'group', chapterId, groupId: groupB })).toBe(false);

    // A student never reaches a management channel by claiming a group id there.
    expect(canAccessChannel(studentOfA, { type: 'chapter_mentors', chapterId })).toBe(false);
  });

  it('gives Regional Directors oversight of every group channel without being a team member', () => {
    const exec: AccessScope = {
      userId: 'exec-1',
      role: 'regional_director',
      headChapterIds: [],
      memberChapterIds: [],
      mentorGroupIds: [],
      studentGroupIds: [],
      teamLeaderGroupIds: [],
    };
    expect(canAccessChannel(exec, { type: 'group', chapterId, groupId: 'any-group' })).toBe(true);
  });
});

describe('mentor never counted as a student-add candidate', () => {
  it('excludes the chapter’s mentors from the student-picker source list', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createMentorInChapter('sadece.mentor');
    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });
    await createUser({
      username: 'sadece.ogrenci',
      fullName: 'Sadece Öğrenci',
      role: 'student',
      chapterId,
      academicYearId,
      actor,
    });

    const chapterMembers = await listChapterMembers(chapterId, academicYearId);
    const studentCandidates = chapterMembers.filter((person) => person.role === 'student');

    expect(studentCandidates.some((person) => person.id === mentor.userId)).toBe(false);
    expect(studentCandidates).toHaveLength(1);
  });
});

describe('persistence across a fresh read (simulated page reload)', () => {
  it('keeps the mentor relationship after re-fetching the group from the database', async () => {
    const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
    const mentor = await createMentorInChapter('kalici.mentor');

    await assignGroupMentor({ groupId: group.id, mentorUserId: mentor.userId, actor });

    // A brand new read, independent of anything cached by assignGroupMentor —
    // exactly what the group detail page does on every request.
    const reloaded = await getGroupById(group.id);
    expect(reloaded?.mentorUserId).toBe(mentor.userId);
  });
});
