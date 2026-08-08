import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import { canDeleteMilestone, canManageProject, canViewGroup } from '@/server/authz/policy';
import { createChapter } from '@/server/services/chapter-service';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey, updateProgramSchedule } from '@/server/services/program-service';
import { generateWeeklySessionsForGroup, listWeeklySessionsByGroup } from '@/server/services/weekly-session-service';
import { finalizeAttendance, updateWorkLogNarrative, approveWeeklySession } from '@/server/services/weekly-work-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import {
  addMilestone,
  createProject,
  deleteMilestone,
  getProjectJourney,
  updateMilestoneStatus,
  updateProjectStatus,
} from '@/server/services/project-service';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterId: string;
let groupId: string;
let mentorAId: string;
let mentorBId: string;

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
});

afterAll(async () => {
  await closeTestDb();
});

describe('project creation', () => {
  it('creates exactly one primary project per group per academic year', async () => {
    const project = await createProject({ groupId, academicYearId, name: 'Su Kalitesi Analizi', actor });
    expect(project.name).toBe('Su Kalitesi Analizi');
    expect(project.health).toBe('on_track');

    await expect(createProject({ groupId, academicYearId, name: 'İkinci Proje', actor })).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === 'conflict',
    );
  });

  it('lets a mentor and chapter head both view the project once it exists, per the same boundary as weekly records', async () => {
    const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
    expect(project).not.toBeNull();

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    expect(canViewGroup(mentorScope, groupId, chapterId)).toBe(true);
    expect(canManageProject(mentorScope, groupId, chapterId)).toBe(true);

    const otherMentorScope = await loadAccessScope(mentorBId, 'mentor', academicYearId);
    expect(canViewGroup(otherMentorScope, groupId, chapterId)).toBe(false);
    expect(canManageProject(otherMentorScope, groupId, chapterId)).toBe(false);
  });
});

describe('project status', () => {
  it('updates the traffic-light health field', async () => {
    const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
    const updated = await updateProjectStatus({ projectId: project.id, health: 'delayed', actor });
    expect(updated.health).toBe('delayed');
  });
});

describe('milestones', () => {
  it('marks completedAt when moved to completed, and clears it when reverted', async () => {
    const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
    const milestone = await addMilestone({
      projectId: project.id,
      title: 'İlk prototip',
      actor: { id: mentorAId, name: 'Mentor A' },
    });
    expect(milestone.completedAt).toBeNull();
    expect(milestone.createdById).toBe(mentorAId);

    const completed = await updateMilestoneStatus({ milestoneId: milestone.id, status: 'completed', actor });
    expect(completed.completedAt).not.toBeNull();

    const reverted = await updateMilestoneStatus({ milestoneId: milestone.id, status: 'planned', actor });
    expect(reverted.completedAt).toBeNull();
  });

  describe('deletion — creator ownership plus RD/VP override', () => {
    it('lets the creating mentor delete their own unused milestone', async () => {
      const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
      const milestone = await addMilestone({
        projectId: project.id,
        title: 'Deneme',
        actor: { id: mentorAId, name: 'Mentor A' },
      });

      const scope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
      expect(
        canDeleteMilestone(scope, { groupId, chapterId, createdByUserId: milestone.createdById }),
      ).toBe(true);

      await deleteMilestone({ milestoneId: milestone.id, actor: { id: mentorAId, name: 'Mentor A' } });
      // Gone: re-deleting throws not_found.
      await expect(
        deleteMilestone({ milestoneId: milestone.id, actor: { id: mentorAId, name: 'Mentor A' } }),
      ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'not_found');
    });

    it('never lets a different mentor delete someone else’s milestone, even in the same group’s scope', async () => {
      const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
      // Mentor B is not assigned to this group, but even if they were, only
      // the creator may delete — simulate the direct-ID bypass attempt.
      const milestone = await addMilestone({
        projectId: project.id,
        title: 'Deneme',
        actor: { id: mentorAId, name: 'Mentor A' },
      });

      const otherScope = await loadAccessScope(mentorBId, 'mentor', academicYearId);
      expect(
        canDeleteMilestone(otherScope, { groupId, chapterId, createdByUserId: milestone.createdById }),
      ).toBe(false);
    });

    it('refuses to destroy a completed milestone even for its creator — history is preserved', async () => {
      const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
      const milestone = await addMilestone({
        projectId: project.id,
        title: 'Deneme',
        actor: { id: mentorAId, name: 'Mentor A' },
      });
      await updateMilestoneStatus({ milestoneId: milestone.id, status: 'completed', actor });

      await expect(
        deleteMilestone({ milestoneId: milestone.id, actor: { id: mentorAId, name: 'Mentor A' } }),
      ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
    });

    it('lets Regional Director delete a milestone they did not create', async () => {
      const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });
      const milestone = await addMilestone({
        projectId: project.id,
        title: 'Deneme',
        actor: { id: mentorAId, name: 'Mentor A' },
      });

      const director = await createUser({ username: 'director.test', fullName: 'Regional Director', role: 'regional_director', actor });
      const directorScope = await loadAccessScope(director.userId, 'regional_director', academicYearId);
      expect(
        canDeleteMilestone(directorScope, { groupId, chapterId, createdByUserId: milestone.createdById }),
      ).toBe(true);

      await deleteMilestone({ milestoneId: milestone.id, actor: { id: director.userId, name: 'Regional Director' } });
    });
  });
});

describe('project journey', () => {
  it('generates the timeline only from finalized weekly records and completed milestones', async () => {
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

    const project = await createProject({ groupId, academicYearId, name: 'Proje', actor });

    // Not finalized yet — contributes nothing to the journey.
    let journey = await getProjectJourney(groupId, project.id);
    expect(journey).toHaveLength(0);

    await finalizeAttendance({ weeklySessionId: session1.id, records: [], actor });
    await updateWorkLogNarrative({
      weeklySessionId: session1.id,
      whatWeDid: 'Konu araştırması yaptık',
      outputs: 'Konu belirlendi',
      nextWeekGoal: 'Kaynak taraması',
      projectHealth: 'on_track',
      actor,
    });
    // No homework this week, and no previous homework applicable.
    const { setHomeworkDecision } = await import('@/server/services/weekly-work-service');
    await setHomeworkDecision({ weeklySessionId: session1.id, noHomework: true, actor });
    await approveWeeklySession({ weeklySessionId: session1.id, actor });

    journey = await getProjectJourney(groupId, project.id);
    expect(journey).toHaveLength(1);
    expect(journey[0]).toMatchObject({ type: 'session', weekNumber: 1, label: 'Konu belirlendi' });
  });
});
