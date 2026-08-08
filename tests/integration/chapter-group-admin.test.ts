import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/server/db';
import { sessions, users } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { canAssignRole, canManageAccounts } from '@/server/authz/policy';
import { createChapter, listChapters, publishChapter, updateChapter } from '@/server/services/chapter-service';
import {
  addGroupMember,
  createGroup,
  listGroupMembers,
  removeGroupMember,
  setTeamLeader,
} from '@/server/services/group-service';
import {
  changeUserRole,
  createUser,
  deactivateUser,
  reactivateUser,
} from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { login } from '@/server/services/auth-service';
import { validateSessionToken } from '@/server/auth/session';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;

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
});

afterAll(async () => {
  await closeTestDb();
});

describe('chapters', () => {
  it('normalizes and validates the chapter code', async () => {
    const chapter = await createChapter({
      programId: onlineProgramId,
      code: 'uaa',
      name: 'Üsküdar Amerikan Akademisi',
      actor,
    });
    expect(chapter.code).toBe('UAA');

    await expect(
      createChapter({ programId: onlineProgramId, code: 'u a!', name: 'X', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a duplicate chapter code', async () => {
    await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'First', actor });
    await expect(
      createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Second', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'conflict');
  });

  it('updates a chapter and publishes it to the public site only when explicitly flipped', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Old Name', actor });
    const updated = await updateChapter({ id: chapter.id, name: 'New Name', actor });
    expect(updated.name).toBe('New Name');
    expect(updated.isPublic).toBe(false);

    const published = await publishChapter({
      id: chapter.id,
      isPublic: true,
      publicDescription: 'Kamuya açık açıklama',
      actor,
    });
    expect(published.isPublic).toBe(true);
    expect(published.publishedAt).not.toBeNull();

    const unpublished = await publishChapter({ id: chapter.id, isPublic: false, actor });
    expect(unpublished.isPublic).toBe(false);
    expect(unpublished.publishedAt).toBeNull();
  });

  it('lists only chapters for the requested program', async () => {
    const bilsem = await getProgramByKey(PROGRAM_KEYS.bilsem);
    await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Online', actor });
    await createChapter({ programId: bilsem!.id, code: 'BLS1', name: 'BİLSEM', actor });

    expect((await listChapters({ programId: onlineProgramId })).map((c) => c.code)).toEqual(['UAA']);
  });
});

describe('groups', () => {
  it('auto-increments the sequence per discipline', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
    const bio1 = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    const bio2 = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    const cs1 = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'cs', actor });

    expect(bio1.name).toBe('Bio 1');
    expect(bio2.name).toBe('Bio 2');
    expect(cs1.name).toBe('CS 1');
  });

  it('rejects an explicit sequence that collides with an existing group', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
    await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', sequence: 1, actor });

    await expect(
      createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', sequence: 1, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'conflict');
  });

  it('manages membership including the Team Leader flag', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });

    const mentorUser = await createUser({
      username: 'mentor.deneme',
      fullName: 'Mentor Deneme',
      role: 'mentor',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });
    const studentUser = await createUser({
      username: 'ogrenci.deneme',
      fullName: 'Öğrenci Deneme',
      role: 'student',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });

    await addGroupMember({ groupId: group.id, userId: mentorUser.userId, role: 'mentor', actor });
    const studentMembership = await addGroupMember({
      groupId: group.id,
      userId: studentUser.userId,
      role: 'student',
      actor,
    });

    let members = await listGroupMembers(group.id);
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.role === 'student')?.isTeamLeader).toBe(false);

    await setTeamLeader({ membershipId: studentMembership.id, isTeamLeader: true, actor });
    members = await listGroupMembers(group.id);
    expect(members.find((m) => m.role === 'student')?.isTeamLeader).toBe(true);

    await removeGroupMember({ membershipId: studentMembership.id, actor });
    members = await listGroupMembers(group.id);
    expect(members).toHaveLength(1);
  });

  it('never lets Team Leader be granted to a mentor membership', async () => {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
    const group = await createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'bio', actor });
    const mentorUser = await createUser({
      username: 'mentor.deneme',
      fullName: 'Mentor Deneme',
      role: 'mentor',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });
    const membership = await addGroupMember({
      groupId: group.id,
      userId: mentorUser.userId,
      role: 'mentor',
      actor,
    });

    await expect(
      setTeamLeader({ membershipId: membership.id, isTeamLeader: true, actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });
});

describe('multiple Regional Directors', () => {
  it('lets two or more accounts hold regional_director at once, with equal authority', async () => {
    const ada = await createUser({ username: 'ada', fullName: 'Ada Sarp Kırık', role: 'regional_director', actor });
    const hande = await createUser({
      username: 'hande',
      fullName: 'Hande Özcan',
      role: 'regional_director',
      actor,
    });

    expect(ada.userId).not.toBe(hande.userId);

    const rows = await getDb().select().from(users).where(eq(users.role, 'regional_director'));
    expect(rows).toHaveLength(2);

    const adaScope = {
      userId: ada.userId,
      role: 'regional_director' as const,
      headChapterIds: [],
      memberChapterIds: [],
      mentorGroupIds: [],
      studentGroupIds: [],
      teamLeaderGroupIds: [],
      advisorProgramIds: [],
      advisorChapterIds: [],
    };
    const handeScope = { ...adaScope, userId: hande.userId };

    // Neither is subordinate: identical permission checks pass for both.
    expect(canManageAccounts(adaScope)).toBe(true);
    expect(canManageAccounts(handeScope)).toBe(true);
    expect(canAssignRole(adaScope, 'vice_president')).toBe(true);
    expect(canAssignRole(handeScope, 'vice_president')).toBe(true);
  });
});

describe('user administration', () => {
  const execActor = { id: null, name: 'Ada' };

  async function createAndLogin(username: string) {
    const created = await createUser({ username, fullName: 'Test User', role: 'regional_director', actor });
    const result = await login({ username, password: created.temporaryPassword, ipHash: null, userAgent: 'vitest' });
    return { created, result };
  }

  async function createMentor(username: string) {
    const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'UAA', actor });
    return createUser({
      username,
      fullName: 'Test User',
      role: 'mentor',
      chapterId: chapter.id,
      academicYearId,
      actor,
    });
  }

  it('deactivating a user revokes every existing session immediately', async () => {
    const { created, result } = await createAndLogin('deaktif.deneme');
    expect(await validateSessionToken(result.sessionToken)).not.toBeNull();

    await deactivateUser({ targetUserId: created.userId, actor: execActor });

    expect(await validateSessionToken(result.sessionToken)).toBeNull();
    const rows = await getDb().select().from(sessions).where(eq(sessions.userId, created.userId));
    expect(rows).toHaveLength(0);
  });

  it('refuses to let an executive deactivate their own account', async () => {
    const created = await createUser({
      username: 'kendi.hesabi',
      fullName: 'Test User',
      role: 'regional_director',
      actor,
    });
    await expect(
      deactivateUser({ targetUserId: created.userId, actor: { id: created.userId, name: 'Kendisi' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('reactivates a deactivated account', async () => {
    const created = await createMentor('geri.aktif');
    await deactivateUser({ targetUserId: created.userId, actor: execActor });
    await reactivateUser({ targetUserId: created.userId, actor: execActor });

    const result = await login({
      username: 'geri.aktif',
      password: created.temporaryPassword,
      ipHash: null,
      userAgent: 'vitest',
    });
    expect(result.mustChangePassword).toBe(true);
  });

  it('never allows a non-executive actor to grant an executive role', async () => {
    const created = await createMentor('terfi.deneme');
    await expect(
      changeUserRole({
        targetUserId: created.userId,
        newRole: 'regional_director',
        actor: { id: null, name: 'Bir Chapter Head', role: 'chapter_head' },
      }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets an executive change a role and revokes existing sessions', async () => {
    const { created, result } = await createAndLogin('rol.degisiyor');
    expect(await validateSessionToken(result.sessionToken)).not.toBeNull();

    await changeUserRole({
      targetUserId: created.userId,
      newRole: 'mentor',
      actor: { id: null, name: 'Ada', role: 'regional_director' },
    });

    expect(await validateSessionToken(result.sessionToken)).toBeNull();
  });
});
