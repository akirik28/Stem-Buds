import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { notifications } from '@/server/db/schema';
import { loadAccessScope } from '@/server/auth/context';
import {
  canAccessChannel,
  canFinalizeWeeklyRecord,
  canManageChapter,
  canManageProject,
  canSeeGroupMemberNames,
  canViewGroup,
  canViewStudentRecords,
} from '@/server/authz/policy';
import {
  getChildOverview,
  listChildWeeks,
  listChildren,
  sendParentMessage,
} from '@/server/services/parent-service';
import { createChapter } from '@/server/services/chapter-service';
import { createUser, setParentStudentLinks } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { addGroupMember, assignGroupMentor, createGroup } from '@/server/services/group-service';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';
import { futureAcademicYearWindow } from '../helpers/academic-year';

/**
 * The Veli (parent) role exists to give one adult a window onto one child.
 * Everything worth testing here is a boundary: what they can reach, and —
 * more importantly — what they must never reach, because the other people in
 * that group are other families' children.
 */

const actor = { id: null, name: 'test-suite' };

let academicYearId: string;
let chapterId: string;
let otherChapterId: string;
let groupId: string;
let otherGroupId: string;
let mentorId: string;
let headId: string;
let vpId: string;
let childId: string;
let classmateId: string;
let strangerId: string;
let parentId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core program missing.');

  const year = await createAcademicYear({ ...futureAcademicYearWindow(), activate: true, actor });
  academicYearId = year.id;

  chapterId = (await createChapter({ programId: online.id, code: 'UAA', name: 'Chapter A', actor })).id;
  otherChapterId = (await createChapter({ programId: online.id, code: 'ROB', name: 'Chapter B', actor })).id;

  const mk = async (username: string, fullName: string, role: Parameters<typeof createUser>[0]['role'], chapter?: string) =>
    (await createUser({ username, fullName, role, chapterId: chapter ?? null, academicYearId: chapter ? academicYearId : null, actor })).userId;

  mentorId = await mk('mentor.a', 'Mentor A', 'mentor', chapterId);
  headId = await mk('head.a', 'Head A', 'chapter_head', chapterId);
  vpId = await mk('vp.a', 'Vice A', 'vice_president');
  childId = await mk('ogr.cocuk', 'Zeynep Kaya', 'student', chapterId);
  classmateId = await mk('ogr.arkadas', 'Ali Demir', 'student', chapterId);
  strangerId = await mk('ogr.yabanci', 'Baska Ogrenci', 'student', otherChapterId);

  groupId = (await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor })).id;
  otherGroupId = (await createGroup({ chapterId: otherChapterId, academicYearId, disciplineKey: 'cs', actor })).id;
  await assignGroupMentor({ groupId, mentorUserId: mentorId, actor });

  await addGroupMember({ groupId, userId: childId, role: 'student', actor });
  await addGroupMember({ groupId, userId: classmateId, role: 'student', actor });
  await addGroupMember({ groupId: otherGroupId, userId: strangerId, role: 'student', actor });

  parentId = (
    await createUser({
      username: 'veli.kaya',
      fullName: 'Hakan Kaya',
      role: 'parent',
      parentOfStudentUserIds: [childId],
      actor,
    })
  ).userId;
});

afterAll(async () => {
  await closeTestDb();
});

const parentScope = () => loadAccessScope(parentId, 'parent', academicYearId);

describe('scope is derived from the child, not from the parent', () => {
  it('gives the parent exactly their child’s group and chapter', async () => {
    const scope = await parentScope();
    expect(scope.parentStudentUserIds).toEqual([childId]);
    expect(scope.parentGroupIds).toEqual([groupId]);
    expect(scope.parentChapterIds).toEqual([chapterId]);
    // A parent has no membership of their own.
    expect(scope.memberChapterIds).toHaveLength(0);
    expect(scope.studentGroupIds).toHaveLength(0);
  });

  it('follows the child when their links change, with no edit to the parent', async () => {
    await setParentStudentLinks({ parentUserId: parentId, studentUserIds: [childId, strangerId], actor });
    const scope = await parentScope();
    expect(new Set(scope.parentGroupIds)).toEqual(new Set([groupId, otherGroupId]));
  });

  it('refuses to link anyone who is not a student', async () => {
    await expect(
      setParentStudentLinks({ parentUserId: parentId, studentUserIds: [mentorId], actor }),
    ).rejects.toSatisfy(isAppError);
  });
});

describe('what a parent may read', () => {
  it('can view their child’s group but not another one', async () => {
    const scope = await parentScope();
    expect(canViewGroup(scope, groupId, chapterId)).toBe(true);
    expect(canViewGroup(scope, otherGroupId, otherChapterId)).toBe(false);
  });

  it('can read their own child’s records but not a classmate’s in the same group', async () => {
    const scope = await parentScope();
    expect(canViewStudentRecords(scope, { userId: childId, groupId, chapterId })).toBe(true);
    // The classmate is in the very same group — being able to see the group
    // must not imply being able to see everyone in it.
    expect(canViewStudentRecords(scope, { userId: classmateId, groupId, chapterId })).toBe(false);
  });

  it('is never shown the names of the other people in the group', async () => {
    const scope = await parentScope();
    expect(canSeeGroupMemberNames(scope)).toBe(false);
  });

  it('receives the group size as a count, with no roster attached', async () => {
    const scope = await parentScope();
    const overview = await getChildOverview(scope, childId);
    expect(overview.groupStudentCount).toBe(2);
    expect(overview.mentorName).toBe('Mentor A');
    // The shape carries no field that could hold another student.
    expect(Object.keys(overview)).not.toContain('students');
    expect(JSON.stringify(overview)).not.toContain('Ali Demir');
  });

  it('refuses to read a child the account does not follow', async () => {
    const scope = await parentScope();
    await expect(getChildOverview(scope, classmateId)).rejects.toSatisfy(isAppError);
    await expect(listChildWeeks(scope, strangerId)).rejects.toSatisfy(isAppError);
  });

  it('lists only the children actually linked', async () => {
    const scope = await parentScope();
    const children = await listChildren(scope);
    expect(children.map((c) => c.studentUserId)).toEqual([childId]);
  });
});

describe('what a parent may never do', () => {
  it('holds no write permission anywhere', async () => {
    const scope = await parentScope();
    expect(canManageChapter(scope, chapterId)).toBe(false);
    expect(canFinalizeWeeklyRecord(scope, groupId, chapterId)).toBe(false);
    expect(canManageProject(scope, groupId, chapterId)).toBe(false);
  });

  it('is blocked from every channel, including their child’s own group channel', async () => {
    const scope = await parentScope();
    for (const channel of [
      { type: 'presidency' as const, chapterId: null },
      { type: 'chapter_management' as const, chapterId: null },
      { type: 'chapter_mentors' as const, chapterId },
      { type: 'group' as const, chapterId, groupId },
    ]) {
      expect(canAccessChannel(scope, channel)).toBe(false);
    }
  });
});

describe('contacting the programme', () => {
  it('reaches the Vice President and the chapter head — never the mentor', async () => {
    const scope = await parentScope();
    await sendParentMessage(scope, {
      studentUserId: childId,
      kind: 'excuse',
      body: 'Cumartesi şehir dışındayız.',
    });

    const rows = await getDb()
      .select({ userId: notifications.userId, type: notifications.type })
      .from(notifications)
      .where(eq(notifications.type, 'parent_excuse'));

    const recipients = new Set(rows.map((r) => r.userId));
    expect(recipients.has(vpId)).toBe(true);
    expect(recipients.has(headId)).toBe(true);
    // A mentor is a high-school student; parent correspondence is not theirs.
    expect(recipients.has(mentorId)).toBe(false);
  });

  it('refuses an empty message', async () => {
    const scope = await parentScope();
    await expect(
      sendParentMessage(scope, { studentUserId: childId, kind: 'question', body: '   ' }),
    ).rejects.toSatisfy(isAppError);
  });

  it('refuses to send on behalf of a child the account does not follow', async () => {
    const scope = await parentScope();
    await expect(
      sendParentMessage(scope, { studentUserId: classmateId, kind: 'question', body: 'Merhaba' }),
    ).rejects.toSatisfy(isAppError);

    const [row] = await getDb()
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(and(eq(notifications.type, 'parent_question')));
    expect(row).toBeUndefined();
  });
});
