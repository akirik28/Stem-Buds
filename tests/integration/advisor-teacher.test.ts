import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  canAccessChannel,
  canFinalizeWeeklyRecord,
  canManageAccounts,
  canManageChapter,
  canManageProject,
  canViewChapter,
  canViewGroup,
  canViewProgram,
  isAdvisorTeacher,
} from '@/server/authz/policy';
import { createChapter } from '@/server/services/chapter-service';
import { createGroup } from '@/server/services/group-service';
import { createUser, setAdvisorProgramScopes } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * Danışman Öğretmen (Advisor Teacher): a Program-scoped, strictly read-only
 * observer. These tests exist because the role was added after Phase 1–3
 * were already built and must slot into the existing scope-array model
 * (`AccessScope.advisorProgramIds`/`advisorChapterIds`) without opening any
 * write permission and — the one hard rule — without ever reaching messages,
 * even for an organization-wide advisor who can see every Program's data
 * everywhere else.
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let bilsemProgramId: string;
let academicYearId: string;
let onlineChapterId: string;
let bilsemChapterId: string;
let onlineGroupId: string;
let bilsemGroupId: string;

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

  const year = await createAcademicYear({
    label: '2026–2027',
    startDate: '2026-09-01',
    endDate: '2027-06-30',
    activate: true,
    actor,
  });
  academicYearId = year.id;

  const onlineChapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Online Chapter', actor });
  const bilsemChapter = await createChapter({ programId: bilsemProgramId, code: 'BLS1', name: 'BİLSEM Ankara', actor });
  onlineChapterId = onlineChapter.id;
  bilsemChapterId = bilsemChapter.id;

  const onlineGroup = await createGroup({ chapterId: onlineChapterId, academicYearId, disciplineKey: 'bio', actor });
  const bilsemGroup = await createGroup({ chapterId: bilsemChapterId, academicYearId, disciplineKey: 'cs', actor });
  onlineGroupId = onlineGroup.id;
  bilsemGroupId = bilsemGroup.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe('advisor_teacher role', () => {
  it('exists as an assignable role, requiring at least one program', async () => {
    await expect(
      createUser({ username: 'advisor.nop', fullName: 'Advisor Nop', role: 'advisor_teacher', actor }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');

    const created = await createUser({
      username: 'advisor.one',
      fullName: 'Advisor One',
      role: 'advisor_teacher',
      programIds: [onlineProgramId],
      actor,
    });
    expect(created.username).toBe('advisor.one');
    expect(isAdvisorTeacher('advisor_teacher')).toBe(true);
  });
});

describe('program-scoped visibility', () => {
  it('lets an organization-wide advisor see both Programs', async () => {
    const advisor = await createUser({
      username: 'advisor.org',
      fullName: 'Advisor Org',
      role: 'advisor_teacher',
      programIds: [onlineProgramId, bilsemProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);

    expect(canViewProgram(scope, onlineProgramId)).toBe(true);
    expect(canViewProgram(scope, bilsemProgramId)).toBe(true);
    expect(canViewChapter(scope, onlineChapterId)).toBe(true);
    expect(canViewChapter(scope, bilsemChapterId)).toBe(true);
    expect(canViewGroup(scope, onlineGroupId, onlineChapterId)).toBe(true);
    expect(canViewGroup(scope, bilsemGroupId, bilsemChapterId)).toBe(true);
  });

  it('confines a BİLSEM-scoped advisor to BİLSEM only', async () => {
    const advisor = await createUser({
      username: 'advisor.bilsem',
      fullName: 'Advisor Bilsem',
      role: 'advisor_teacher',
      programIds: [bilsemProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);

    expect(canViewProgram(scope, bilsemProgramId)).toBe(true);
    expect(canViewProgram(scope, onlineProgramId)).toBe(false);
    expect(canViewChapter(scope, bilsemChapterId)).toBe(true);
    expect(canViewChapter(scope, onlineChapterId)).toBe(false);
    expect(canViewGroup(scope, bilsemGroupId, bilsemChapterId)).toBe(true);
    // Direct-ID manipulation: guessing the real Online group/chapter IDs still fails.
    expect(canViewGroup(scope, onlineGroupId, onlineChapterId)).toBe(false);
  });

  it('confines an Online Ortaokul-scoped advisor to that Program only', async () => {
    const advisor = await createUser({
      username: 'advisor.online',
      fullName: 'Advisor Online',
      role: 'advisor_teacher',
      programIds: [onlineProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);

    expect(canViewChapter(scope, onlineChapterId)).toBe(true);
    expect(canViewChapter(scope, bilsemChapterId)).toBe(false);
    expect(canViewGroup(scope, onlineGroupId, onlineChapterId)).toBe(true);
    expect(canViewGroup(scope, bilsemGroupId, bilsemChapterId)).toBe(false);
  });

  it('supports assigning more Programs to the same advisor later', async () => {
    const advisor = await createUser({
      username: 'advisor.grow',
      fullName: 'Advisor Grow',
      role: 'advisor_teacher',
      programIds: [onlineProgramId],
      actor,
    });
    let scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    expect(canViewChapter(scope, bilsemChapterId)).toBe(false);

    await setAdvisorProgramScopes({ userId: advisor.userId, programIds: [onlineProgramId, bilsemProgramId], actor });
    scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    expect(canViewChapter(scope, bilsemChapterId)).toBe(true);
  });
});

describe('strictly read-only', () => {
  it('never grants any write/management permission, in or out of scope', async () => {
    const advisor = await createUser({
      username: 'advisor.readonly',
      fullName: 'Advisor Readonly',
      role: 'advisor_teacher',
      programIds: [onlineProgramId, bilsemProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);

    expect(canManageChapter(scope, onlineChapterId)).toBe(false);
    expect(canFinalizeWeeklyRecord(scope, onlineGroupId, onlineChapterId)).toBe(false);
    expect(canManageProject(scope, onlineGroupId, onlineChapterId)).toBe(false);
    expect(canManageAccounts(scope)).toBe(false);
  });
});

describe('absolutely no message access', () => {
  it('blocks every channel type for a program-scoped advisor', async () => {
    const advisor = await createUser({
      username: 'advisor.nomsg',
      fullName: 'Advisor Nomsg',
      role: 'advisor_teacher',
      programIds: [onlineProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);

    expect(canAccessChannel(scope, { type: 'group', chapterId: onlineChapterId, groupId: onlineGroupId })).toBe(false);
    expect(canAccessChannel(scope, { type: 'chapter_mentors', chapterId: onlineChapterId })).toBe(false);
    expect(canAccessChannel(scope, { type: 'chapter_management', chapterId: onlineChapterId })).toBe(false);
    expect(canAccessChannel(scope, { type: 'presidency', chapterId: null })).toBe(false);
  });

  it('still blocks every channel for an organization-wide advisor who can see everything else', async () => {
    const advisor = await createUser({
      username: 'advisor.orgnomsg',
      fullName: 'Advisor Org Nomsg',
      role: 'advisor_teacher',
      programIds: [onlineProgramId, bilsemProgramId],
      actor,
    });
    const scope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);

    // Sanity: this advisor really can see the group's operational data.
    expect(canViewGroup(scope, onlineGroupId, onlineChapterId)).toBe(true);
    // But never its message channel, even so.
    expect(canAccessChannel(scope, { type: 'group', chapterId: onlineChapterId, groupId: onlineGroupId })).toBe(false);
    expect(canAccessChannel(scope, { type: 'group', chapterId: bilsemChapterId, groupId: bilsemGroupId })).toBe(false);
  });
});
