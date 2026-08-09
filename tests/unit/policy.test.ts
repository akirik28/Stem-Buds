import { describe, expect, it } from 'vitest';
import {
  canAccessChannel,
  canAccessComplaint,
  canApproveWeeklySession,
  canAssignRole,
  canDeleteHomeworkAssignment,
  canDeleteMilestone,
  canEditWeeklyNarrative,
  canExportChapter,
  canExportOrganization,
  canFinalizeWeeklyRecord,
  canManageAccounts,
  canManageChapter,
  canManagePublicContent,
  canManageProject,
  canSeeComplaintReporter,
  canViewChapter,
  canViewGroup,
  canViewManagementFeed,
  type AccessScope,
} from '@/server/authz/policy';

const CHAPTER_A = 'chapter-a';
const CHAPTER_B = 'chapter-b';
const GROUP_A1 = 'group-a1';
const GROUP_A2 = 'group-a2';

function scope(overrides: Partial<AccessScope> & Pick<AccessScope, 'userId' | 'role'>): AccessScope {
  return {
    headChapterIds: [],
    memberChapterIds: [],
    mentorGroupIds: [],
    studentGroupIds: [],
    teamLeaderGroupIds: [],
    advisorProgramIds: [],
    advisorChapterIds: [],
    ...overrides,
  };
}

const executive = scope({ userId: 'exec-1', role: 'regional_director' });
const viceDirector = scope({ userId: 'exec-2', role: 'vice_president' });

const chapterHeadA = scope({
  userId: 'head-a',
  role: 'chapter_head',
  headChapterIds: [CHAPTER_A],
  memberChapterIds: [CHAPTER_A],
});

const mentorA1 = scope({
  userId: 'mentor-a1',
  role: 'mentor',
  memberChapterIds: [CHAPTER_A],
  mentorGroupIds: [GROUP_A1],
});

const studentA1 = scope({
  userId: 'student-a1',
  role: 'student',
  memberChapterIds: [CHAPTER_A],
  studentGroupIds: [GROUP_A1],
});

const teamLeaderA1 = scope({
  userId: 'leader-a1',
  role: 'student',
  memberChapterIds: [CHAPTER_A],
  studentGroupIds: [GROUP_A1],
  teamLeaderGroupIds: [GROUP_A1],
});

describe('chapter scope', () => {
  it('lets an executive view every chapter', () => {
    expect(canViewChapter(executive, CHAPTER_A)).toBe(true);
    expect(canViewChapter(executive, CHAPTER_B)).toBe(true);
  });

  it('confines a chapter head to their own chapter', () => {
    expect(canViewChapter(chapterHeadA, CHAPTER_A)).toBe(true);
    expect(canViewChapter(chapterHeadA, CHAPTER_B)).toBe(false);
    expect(canManageChapter(chapterHeadA, CHAPTER_B)).toBe(false);
  });

  it('does not let a mentor manage a chapter', () => {
    expect(canManageChapter(mentorA1, CHAPTER_A)).toBe(false);
  });
});

describe('group scope', () => {
  it('lets a mentor see only assigned groups', () => {
    expect(canViewGroup(mentorA1, GROUP_A1, CHAPTER_A)).toBe(true);
    expect(canViewGroup(mentorA1, GROUP_A2, CHAPTER_A)).toBe(false);
  });

  it('lets a student see only their own group', () => {
    expect(canViewGroup(studentA1, GROUP_A1, CHAPTER_A)).toBe(true);
    expect(canViewGroup(studentA1, GROUP_A2, CHAPTER_A)).toBe(false);
  });

  it('lets a chapter head see every group in their chapter', () => {
    expect(canViewGroup(chapterHeadA, GROUP_A2, CHAPTER_A)).toBe(true);
    expect(canViewGroup(chapterHeadA, GROUP_A2, CHAPTER_B)).toBe(false);
  });
});

describe('weekly record authority', () => {
  it('lets a team leader draft the narrative but never finalize', () => {
    expect(canEditWeeklyNarrative(teamLeaderA1, GROUP_A1, CHAPTER_A)).toBe(true);
    expect(canFinalizeWeeklyRecord(teamLeaderA1, GROUP_A1, CHAPTER_A)).toBe(false);
    expect(canApproveWeeklySession(teamLeaderA1, GROUP_A1, CHAPTER_A)).toBe(false);
  });

  it('never lets a team leader draft a different group’s narrative, even by ID', () => {
    // teamLeaderA1 is Team Leader of GROUP_A1 only — GROUP_A2 must stay closed
    // to them even though it is in the same chapter.
    expect(canEditWeeklyNarrative(teamLeaderA1, GROUP_A2, CHAPTER_A)).toBe(false);
  });

  it('does not let a plain student edit anything', () => {
    expect(canEditWeeklyNarrative(studentA1, GROUP_A1, CHAPTER_A)).toBe(false);
    expect(canFinalizeWeeklyRecord(studentA1, GROUP_A1, CHAPTER_A)).toBe(false);
  });

  it('lets the assigned mentor finalize their own group only', () => {
    expect(canFinalizeWeeklyRecord(mentorA1, GROUP_A1, CHAPTER_A)).toBe(true);
    expect(canFinalizeWeeklyRecord(mentorA1, GROUP_A2, CHAPTER_A)).toBe(false);
  });

  it('lets a chapter head correct records inside their chapter', () => {
    expect(canFinalizeWeeklyRecord(chapterHeadA, GROUP_A2, CHAPTER_A)).toBe(true);
    expect(canFinalizeWeeklyRecord(chapterHeadA, GROUP_A2, CHAPTER_B)).toBe(false);
  });
});

describe('project authorization', () => {
  it('lets only the group’s own mentor (or Executive Management) manage the project entity', () => {
    expect(canManageProject(mentorA1, GROUP_A1, CHAPTER_A)).toBe(true);
    expect(canManageProject(mentorA1, GROUP_A2, CHAPTER_A)).toBe(false);
    expect(canManageProject(executive, GROUP_A2, CHAPTER_A)).toBe(true);
  });

  it('gives Chapter Head oversight (view) but not project-editing rights — narrower than the weekly-record boundary', () => {
    // Unlike weekly records, where the spec explicitly grants a correction
    // right, the Project entity itself stays Mentor/management-only; Chapter
    // Head still sees it via canViewGroup, just cannot edit it.
    expect(canViewGroup(chapterHeadA, GROUP_A2, CHAPTER_A)).toBe(true);
    expect(canManageProject(chapterHeadA, GROUP_A2, CHAPTER_A)).toBe(false);
  });

  it('never lets a student — Team Leader or not — manage the project entity itself', () => {
    // Section 8 of the master spec gives a Team Leader draft rights over the
    // weekly narrative only; the Project's own fields (status, milestones,
    // outcome) stay Mentor/management-only, same as official homework status.
    expect(canManageProject(studentA1, GROUP_A1, CHAPTER_A)).toBe(false);
    expect(canManageProject(teamLeaderA1, GROUP_A1, CHAPTER_A)).toBe(false);
  });

  it('lets only the record’s creator delete their own milestone/homework, inside their own scope', () => {
    expect(
      canDeleteMilestone(mentorA1, { groupId: GROUP_A1, chapterId: CHAPTER_A, createdByUserId: 'mentor-a1' }),
    ).toBe(true);
    // Someone else's creation, even inside a group this mentor legitimately manages.
    expect(
      canDeleteMilestone(mentorA1, { groupId: GROUP_A1, chapterId: CHAPTER_A, createdByUserId: 'someone-else' }),
    ).toBe(false);
    // A Chapter Head's correction rights do not extend to deleting a Mentor's creation.
    expect(
      canDeleteMilestone(chapterHeadA, { groupId: GROUP_A1, chapterId: CHAPTER_A, createdByUserId: 'mentor-a1' }),
    ).toBe(false);
    expect(
      canDeleteHomeworkAssignment(mentorA1, { groupId: GROUP_A1, chapterId: CHAPTER_A, createdByUserId: 'mentor-a1' }),
    ).toBe(true);
    expect(
      canDeleteHomeworkAssignment(executive, { groupId: GROUP_A1, chapterId: CHAPTER_A, createdByUserId: 'mentor-a1' }),
    ).toBe(true);
  });
});

describe('account administration', () => {
  it('is executive-only', () => {
    expect(canManageAccounts(executive)).toBe(true);
    expect(canManageAccounts(chapterHeadA)).toBe(false);
    expect(canManageAccounts(mentorA1)).toBe(false);
  });

  it('never lets a chapter head grant an executive role', () => {
    expect(canAssignRole(chapterHeadA, 'regional_director')).toBe(false);
    expect(canAssignRole(chapterHeadA, 'mentor')).toBe(false);
    expect(canAssignRole(executive, 'vice_president')).toBe(true);
  });

  it('gives Vice President the exact same organization-wide authority as Regional Director — title differs, permissions never do', () => {
    expect(canManageAccounts(viceDirector)).toBe(true);
    expect(canViewChapter(viceDirector, CHAPTER_A)).toBe(true);
    expect(canViewChapter(viceDirector, CHAPTER_B)).toBe(true);
    expect(canManageChapter(viceDirector, CHAPTER_B)).toBe(true);
    expect(canFinalizeWeeklyRecord(viceDirector, GROUP_A2, CHAPTER_A)).toBe(true);
    expect(canManageProject(viceDirector, GROUP_A2, CHAPTER_A)).toBe(true);
    expect(canAssignRole(viceDirector, 'regional_director')).toBe(true);
    expect(
      canDeleteMilestone(viceDirector, { groupId: GROUP_A1, chapterId: CHAPTER_A, createdByUserId: 'mentor-a1' }),
    ).toBe(true);
    expect(canViewManagementFeed(viceDirector)).toBe(true);
    expect(canExportOrganization(viceDirector)).toBe(true);
  });
});

describe('complaint privacy', () => {
  const baseComplaint = {
    chapterId: CHAPTER_A,
    scope: 'chapter' as const,
    targetUserId: null as string | null,
    reporterUserId: null as string | null,
    isAnonymous: false,
  };

  it('never lets the complaint target read it, even an executive', () => {
    const aboutExecutive = { ...baseComplaint, scope: 'executive' as const, targetUserId: 'exec-1' };
    expect(canAccessComplaint(executive, aboutExecutive)).toBe(false);

    const otherExecutive = scope({ userId: 'exec-2', role: 'regional_director' });
    expect(canAccessComplaint(otherExecutive, aboutExecutive)).toBe(true);
  });

  it('keeps a complaint about a chapter head away from that chapter head', () => {
    const aboutHead = {
      ...baseComplaint,
      scope: 'executive' as const,
      targetUserId: 'head-a',
    };
    expect(canAccessComplaint(chapterHeadA, aboutHead)).toBe(false);
    expect(canAccessComplaint(executive, aboutHead)).toBe(true);
  });

  it('hides executive-scope complaints from every chapter head', () => {
    const escalated = { ...baseComplaint, scope: 'executive' as const };
    expect(canAccessComplaint(chapterHeadA, escalated)).toBe(false);
  });

  it('lets an authorized chapter head read chapter-scope complaints', () => {
    expect(canAccessComplaint(chapterHeadA, baseComplaint)).toBe(true);
    expect(canAccessComplaint(chapterHeadA, { ...baseComplaint, chapterId: CHAPTER_B })).toBe(false);
  });

  it('never reveals an anonymous reporter', () => {
    const anonymous = { ...baseComplaint, isAnonymous: true, reporterUserId: null };
    expect(canAccessComplaint(chapterHeadA, anonymous)).toBe(true);
    expect(canSeeComplaintReporter(chapterHeadA, anonymous)).toBe(false);
    expect(canSeeComplaintReporter(executive, anonymous)).toBe(false);
  });

  it('does not let an unrelated student read a complaint', () => {
    expect(canAccessComplaint(studentA1, baseComplaint)).toBe(false);
  });
});

describe('messaging channels', () => {
  it('never admits a student', () => {
    expect(canAccessChannel(studentA1, { type: 'presidency', chapterId: null })).toBe(false);
    expect(canAccessChannel(studentA1, { type: 'chapter_management', chapterId: null })).toBe(false);
    expect(canAccessChannel(studentA1, { type: 'chapter_mentors', chapterId: CHAPTER_A })).toBe(
      false,
    );
    expect(canAccessChannel(teamLeaderA1, { type: 'chapter_mentors', chapterId: CHAPTER_A })).toBe(
      false,
    );
  });

  it('keeps BAŞKANLIK to executives', () => {
    expect(canAccessChannel(executive, { type: 'presidency', chapterId: null })).toBe(true);
    expect(canAccessChannel(chapterHeadA, { type: 'presidency', chapterId: null })).toBe(false);
    expect(canAccessChannel(mentorA1, { type: 'presidency', chapterId: null })).toBe(false);
  });

  it('keeps a mentor out of another chapter’s mentor channel', () => {
    expect(canAccessChannel(mentorA1, { type: 'chapter_mentors', chapterId: CHAPTER_A })).toBe(true);
    expect(canAccessChannel(mentorA1, { type: 'chapter_mentors', chapterId: CHAPTER_B })).toBe(
      false,
    );
  });
});

describe('exports and management feed', () => {
  it('limits a chapter head to their own chapter export', () => {
    expect(canExportChapter(chapterHeadA, CHAPTER_A)).toBe(true);
    expect(canExportChapter(chapterHeadA, CHAPTER_B)).toBe(false);
    expect(canExportOrganization(chapterHeadA)).toBe(false);
    expect(canExportOrganization(executive)).toBe(true);
  });

  it('opens the management feed to management only', () => {
    expect(canViewManagementFeed(executive)).toBe(true);
    expect(canViewManagementFeed(chapterHeadA)).toBe(true);
    expect(canViewManagementFeed(mentorA1)).toBe(false);
    expect(canViewManagementFeed(studentA1)).toBe(false);
  });
});

describe('public site content management', () => {
  it('restricts the CMS to Executives only', () => {
    expect(canManagePublicContent(executive)).toBe(true);
    expect(canManagePublicContent(viceDirector)).toBe(true);
    expect(canManagePublicContent(chapterHeadA)).toBe(false);
    expect(canManagePublicContent(mentorA1)).toBe(false);
    expect(canManagePublicContent(studentA1)).toBe(false);
  });
});
