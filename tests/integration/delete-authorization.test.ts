import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import { canDeleteHomeworkAssignment } from '@/server/authz/policy';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import {
  deleteHomeworkAssignment,
  finalizePreviousHomeworkResults,
  getHomeworkAssignmentBySessionId,
  setHomeworkDecision,
} from '@/server/services/weekly-work-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * "Creator can delete what they create" — the delete-specific authorization
 * layer added on top of Phase 3's existing create/edit permissions.
 * Creation permission (`canFinalizeWeeklyRecord`/`canManageProject`) defines
 * the type/scope a person may act in; ownership decides whether they may
 * delete *that particular record*. Regional Director/Vice President keep an
 * organization-wide override; nobody may destroy a record that already has
 * meaningful history (results finalized, or — for milestones, see
 * project-service.test.ts — already marked completed).
 */

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterId: string;
let groupId: string;
let mentorAId: string;
let mentorBId: string;
let session1Id: string;

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

  const chapter = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  chapterId = chapter.id;

  const group = await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor });
  groupId = group.id;

  const mentorA = await createUser({
    username: 'mentor.a',
    fullName: 'Mentor A',
    role: 'mentor',
    chapterId,
    academicYearId,
    actor,
  });
  mentorAId = mentorA.userId;
  await assignGroupMentor({ groupId, mentorUserId: mentorAId, actor });

  const mentorB = await createUser({
    username: 'mentor.b',
    fullName: 'Mentor B',
    role: 'mentor',
    chapterId,
    academicYearId,
    actor,
  });
  mentorBId = mentorB.userId;

  await updateProgramSchedule({
    programId: onlineProgramId,
    weeklyDayOfWeek: 6,
    weeklyStartMinute: 18 * 60,
    weeklyDurationMinutes: 60,
    actor,
  });
  await generateWeeklySessionsForGroup(groupId);
  const [session1] = await listWeeklySessionsByGroup(groupId);
  if (!session1) throw new Error('No session generated.');
  session1Id = session1.id;
});

afterAll(async () => {
  await closeTestDb();
});

describe('homework assignment deletion', () => {
  it('lets the creating mentor delete their own unused assignment', async () => {
    await setHomeworkDecision({
      weeklySessionId: session1Id,
      noHomework: false,
      description: '100 görüntü etiketleyin.',
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    const assignment = await getHomeworkAssignmentBySessionId(session1Id);
    if (!assignment) throw new Error('Assignment missing.');

    const scope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(
      canDeleteHomeworkAssignment(scope, { groupId, chapterId, createdByUserId: assignment.createdById }),
    ).toBe(true);

    await deleteHomeworkAssignment({ assignmentId: assignment.id, actor: { id: mentorAId, name: 'Mentor A' } });
    expect(await getHomeworkAssignmentBySessionId(session1Id)).toBeNull();
  });

  it('never lets a different mentor delete another mentor’s assignment', async () => {
    await setHomeworkDecision({
      weeklySessionId: session1Id,
      noHomework: false,
      description: '100 görüntü etiketleyin.',
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    const assignment = await getHomeworkAssignmentBySessionId(session1Id);
    if (!assignment) throw new Error('Assignment missing.');

    const otherScope = await loadAccessScope(mentorBId, 'mentor', academicYearId);
    expect(
      canDeleteHomeworkAssignment(otherScope, { groupId, chapterId, createdByUserId: assignment.createdById }),
    ).toBe(false);
  });

  it('refuses to destroy an assignment once results were finalized — history is preserved', async () => {
    await setHomeworkDecision({
      weeklySessionId: session1Id,
      noHomework: false,
      description: '100 görüntü etiketleyin.',
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    const [session2] = (await listWeeklySessionsByGroup(groupId)).filter((s) => s.weekNumber === 2);
    if (!session2) throw new Error('Second session missing.');

    await finalizePreviousHomeworkResults({
      weeklySessionId: session2.id,
      statuses: [],
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    const assignment = await getHomeworkAssignmentBySessionId(session1Id);
    if (!assignment) throw new Error('Assignment missing.');
    expect(assignment.resultsFinalizedAt).not.toBeNull();

    await expect(
      deleteHomeworkAssignment({ assignmentId: assignment.id, actor: { id: mentorAId, name: 'Mentor A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets Regional Director delete an assignment they did not create', async () => {
    await setHomeworkDecision({
      weeklySessionId: session1Id,
      noHomework: false,
      description: '100 görüntü etiketleyin.',
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    const assignment = await getHomeworkAssignmentBySessionId(session1Id);
    if (!assignment) throw new Error('Assignment missing.');

    const director = await createUser({ username: 'director.test', fullName: 'Regional Director', role: 'regional_director', actor });
    const directorScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
    expect(
      canDeleteHomeworkAssignment(directorScope, { groupId, chapterId, createdByUserId: assignment.createdById }),
    ).toBe(true);

    await deleteHomeworkAssignment({ assignmentId: assignment.id, actor: { id: director.userId, name: 'Regional Director' } });
    expect(await getHomeworkAssignmentBySessionId(session1Id)).toBeNull();
  });

  it('never grants an Advisor Teacher any delete right — they create nothing, so they delete nothing', async () => {
    await setHomeworkDecision({
      weeklySessionId: session1Id,
      noHomework: false,
      description: '100 görüntü etiketleyin.',
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    const assignment = await getHomeworkAssignmentBySessionId(session1Id);
    if (!assignment) throw new Error('Assignment missing.');

    const advisor = await createUser({
      username: 'advisor.readonly',
      fullName: 'Advisor Readonly',
      role: 'advisor_teacher',
      programIds: [onlineProgramId],
      actor,
    });
    const advisorScope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    expect(
      canDeleteHomeworkAssignment(advisorScope, { groupId, chapterId, createdByUserId: assignment.createdById }),
    ).toBe(false);
  });
});
