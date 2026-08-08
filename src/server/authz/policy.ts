import type { userRoleEnum } from '@/server/db/schema';

export type UserRole = (typeof userRoleEnum.enumValues)[number];

/**
 * Everything the authorization rules need about the signed-in user.
 *
 * Deliberately a plain data object: every rule below is a pure function so the
 * permission model can be unit-tested exhaustively, independently of HTTP,
 * React, or the database.
 */
export type AccessScope = {
  userId: string;
  role: UserRole;
  /** Chapters where the user is the responsible Chapter Head. */
  headChapterIds: readonly string[];
  /** Chapters the user belongs to in any role. */
  memberChapterIds: readonly string[];
  /** Groups the user mentors. */
  mentorGroupIds: readonly string[];
  /** Groups the user attends as a student. */
  studentGroupIds: readonly string[];
  /** Subset of `studentGroupIds` where the student is also Team Leader. */
  teamLeaderGroupIds: readonly string[];
  /** Programs an Advisor Teacher is scoped to observe. Empty for every other role. */
  advisorProgramIds: readonly string[];
  /** Every chapter inside `advisorProgramIds`, precomputed for `canViewChapter`/`canViewGroup`. */
  advisorChapterIds: readonly string[];
};

export const EXECUTIVE_ROLES: readonly UserRole[] = ['regional_director', 'vice_president'];

export function isExecutive(role: UserRole): boolean {
  return EXECUTIVE_ROLES.includes(role);
}

export function isChapterHead(role: UserRole): boolean {
  return role === 'chapter_head';
}

export function isMentor(role: UserRole): boolean {
  return role === 'mentor';
}

export function isStudent(role: UserRole): boolean {
  return role === 'student';
}

/**
 * A Danışman Öğretmen (Advisor Teacher): a read-only academic/operational
 * observer scoped to one or more Programs. Never a management role — no
 * `can*` write-permission function in this file ever returns true for it.
 */
export function isAdvisorTeacher(role: UserRole): boolean {
  return role === 'advisor_teacher';
}

/** Only Executive Management may create accounts or change executive roles. */
export function canManageAccounts(scope: AccessScope): boolean {
  return isExecutive(scope.role);
}

/** Only Executive Management may assign a role at executive level. */
export function canAssignRole(scope: AccessScope, targetRole: UserRole): boolean {
  if (!canManageAccounts(scope)) return false;
  // Spelled out rather than implied: an executive-level role may only ever be
  // granted by Executive Management, so a Chapter Head can never promote
  // anyone into one even if account management were widened later.
  if (isExecutive(targetRole)) return isExecutive(scope.role);
  return true;
}

/** Read access to a Program's aggregate data (used by top-level Program filters). */
export function canViewProgram(scope: AccessScope, programId: string): boolean {
  if (isExecutive(scope.role)) return true;
  if (isAdvisorTeacher(scope.role)) return scope.advisorProgramIds.includes(programId);
  return false;
}

/** Read access to a chapter's operational data. */
export function canViewChapter(scope: AccessScope, chapterId: string): boolean {
  if (isExecutive(scope.role)) return true;
  if (isChapterHead(scope.role)) return scope.headChapterIds.includes(chapterId);
  if (isAdvisorTeacher(scope.role)) return scope.advisorChapterIds.includes(chapterId);
  return scope.memberChapterIds.includes(chapterId);
}

/** Write access to a chapter's operational data (corrections, group setup...). */
export function canManageChapter(scope: AccessScope, chapterId: string): boolean {
  if (isExecutive(scope.role)) return true;
  return isChapterHead(scope.role) && scope.headChapterIds.includes(chapterId);
}

/** Read access to a group. `chapterId` is the chapter the group belongs to. */
export function canViewGroup(scope: AccessScope, groupId: string, chapterId: string): boolean {
  if (isExecutive(scope.role)) return true;
  if (isChapterHead(scope.role)) return scope.headChapterIds.includes(chapterId);
  if (isMentor(scope.role)) return scope.mentorGroupIds.includes(groupId);
  if (isStudent(scope.role)) return scope.studentGroupIds.includes(groupId);
  if (isAdvisorTeacher(scope.role)) return scope.advisorChapterIds.includes(chapterId);
  return false;
}

/** May edit the free-text part of a weekly work record (narrative, goal). */
export function canEditWeeklyNarrative(
  scope: AccessScope,
  groupId: string,
  chapterId: string,
): boolean {
  if (canManageChapter(scope, chapterId)) return true;
  if (isMentor(scope.role) && scope.mentorGroupIds.includes(groupId)) return true;
  // Team Leader drafts the narrative and the next-week goal for their own group.
  return scope.teamLeaderGroupIds.includes(groupId);
}

/**
 * May finalize official attendance, homework results, project health and the
 * mentor approval. Students — including Team Leaders — never may.
 */
export function canFinalizeWeeklyRecord(
  scope: AccessScope,
  groupId: string,
  chapterId: string,
): boolean {
  if (canManageChapter(scope, chapterId)) return true;
  return isMentor(scope.role) && scope.mentorGroupIds.includes(groupId);
}

/** Only a mentor of the group, or someone above them, may approve a session. */
export function canApproveWeeklySession(
  scope: AccessScope,
  groupId: string,
  chapterId: string,
): boolean {
  return canFinalizeWeeklyRecord(scope, groupId, chapterId);
}

/**
 * May create/edit a group's project: details, status, milestones, outcome.
 * Same boundary as the weekly record — the project's mentor, or chapter
 * oversight/above. A Team Leader may draft the weekly narrative but has no
 * project-editing right of their own per the master spec.
 */
/**
 * Unlike weekly records (where the master spec explicitly grants Chapter
 * Head a correction right), Chapter Head's role for the Project entity
 * itself is Chapter-level oversight/viewing only — `canViewGroup` already
 * covers that. Only the group's own Mentor edits Project fields directly;
 * Executive Management keeps its usual organization-wide override. This is
 * a deliberately narrower boundary than `canFinalizeWeeklyRecord` — do not
 * widen it to Chapter Head without an explicit spec change.
 */
export function canManageProject(scope: AccessScope, groupId: string, _chapterId: string): boolean {
  if (isExecutive(scope.role)) return true;
  return isMentor(scope.role) && scope.mentorGroupIds.includes(groupId);
}

/**
 * Deletion is narrower than editing everywhere in the product: creation
 * permission (`canManageProject`/`canFinalizeWeeklyRecord`) defines the
 * type/scope a person may act in, but only the record's actual creator may
 * delete that specific record — Regional Director/Vice President keep an
 * organization-wide administrative override on top. A Chapter Head's
 * correction rights inside their own chapter do NOT extend to deleting a
 * Mentor's creations; only their own.
 */
export function canDeleteMilestone(
  scope: AccessScope,
  target: { groupId: string; chapterId: string; createdByUserId: string | null },
): boolean {
  if (isExecutive(scope.role)) return true;
  if (target.createdByUserId === null) return false;
  return target.createdByUserId === scope.userId && canManageProject(scope, target.groupId, target.chapterId);
}

/** Same ownership rule as `canDeleteMilestone`, scoped to weekly homework assignments. */
export function canDeleteHomeworkAssignment(
  scope: AccessScope,
  target: { groupId: string; chapterId: string; createdByUserId: string | null },
): boolean {
  if (isExecutive(scope.role)) return true;
  if (target.createdByUserId === null) return false;
  return (
    target.createdByUserId === scope.userId && canFinalizeWeeklyRecord(scope, target.groupId, target.chapterId)
  );
}

/** Whether the user may read another user's protected personal records. */
export function canViewStudentRecords(
  scope: AccessScope,
  target: { userId: string; groupId: string; chapterId: string },
): boolean {
  if (scope.userId === target.userId) return true;
  return canViewGroup(scope, target.groupId, target.chapterId);
}

export type ComplaintAccessInput = {
  chapterId: string;
  scope: 'chapter' | 'executive';
  targetUserId: string | null;
  reporterUserId: string | null;
  isAnonymous: boolean;
};

/**
 * Complaint access, enforced on the server for every read path.
 *
 * Rules:
 *  - the person a complaint is about can never read it, whatever their role;
 *  - complaints escalated to `executive` scope are invisible to Chapter Heads,
 *    which is how a complaint about a Chapter Head stays out of reach;
 *  - an identified reporter may follow their own complaint.
 */
export function canAccessComplaint(scope: AccessScope, complaint: ComplaintAccessInput): boolean {
  if (complaint.targetUserId !== null && complaint.targetUserId === scope.userId) return false;

  if (isExecutive(scope.role)) return true;

  if (isChapterHead(scope.role)) {
    if (complaint.scope === 'executive') return false;
    return scope.headChapterIds.includes(complaint.chapterId);
  }

  if (!complaint.isAnonymous && complaint.reporterUserId === scope.userId) return true;

  return false;
}

/** Whether the reporter identity may be revealed to this viewer. */
export function canSeeComplaintReporter(
  scope: AccessScope,
  complaint: ComplaintAccessInput,
): boolean {
  if (complaint.isAnonymous) return false;
  return canAccessComplaint(scope, complaint);
}

export type ChannelAccessInput = {
  type: 'presidency' | 'chapter_management' | 'chapter_mentors' | 'group';
  chapterId: string | null;
  /** Set only for `group` channels. */
  groupId?: string | null;
};

/**
 * Channel membership rules.
 *
 * Students are never members of any *management* channel (presidency,
 * chapter management, chapter mentors) — but a `group` channel is the one
 * place they do belong, alongside that specific group's assigned mentor,
 * because it is their own group's channel, not a management structure.
 * Regional Directors keep disclosed oversight access everywhere, including
 * every group channel, for moderation and safeguarding.
 */
export function canAccessChannel(scope: AccessScope, channel: ChannelAccessInput): boolean {
  // Hard rule, checked first and unconditionally: an Advisor Teacher must
  // never reach any message, in any channel, at any scope — including an
  // organization-wide advisor who can see both Programs' data everywhere
  // else. This does not get an exception when messaging (Phase 7) is built.
  if (isAdvisorTeacher(scope.role)) return false;
  if (isExecutive(scope.role)) return true;

  if (channel.type === 'group') {
    if (!channel.groupId) return false;
    if (isMentor(scope.role)) return scope.mentorGroupIds.includes(channel.groupId);
    if (isStudent(scope.role)) return scope.studentGroupIds.includes(channel.groupId);
    if (isChapterHead(scope.role)) {
      return channel.chapterId !== null && scope.headChapterIds.includes(channel.chapterId);
    }
    return false;
  }

  if (isStudent(scope.role)) return false;

  if (channel.type === 'presidency') return false;
  if (channel.type === 'chapter_management') return isChapterHead(scope.role);

  if (channel.type === 'chapter_mentors') {
    if (channel.chapterId === null) return false;
    if (isChapterHead(scope.role)) return scope.headChapterIds.includes(channel.chapterId);
    if (isMentor(scope.role)) return scope.memberChapterIds.includes(channel.chapterId);
  }

  return false;
}

/** Whether the viewer's channel membership is oversight rather than team membership. */
export function isOversightMembership(scope: AccessScope, channel: ChannelAccessInput): boolean {
  if (!isExecutive(scope.role)) return false;
  return channel.type === 'chapter_mentors' || channel.type === 'group';
}

/** May export chapter data to Excel. */
export function canExportChapter(scope: AccessScope, chapterId: string): boolean {
  return canManageChapter(scope, chapterId);
}

/** May export the whole organization. */
export function canExportOrganization(scope: AccessScope): boolean {
  return isExecutive(scope.role);
}

/** May publish or unpublish public website content. */
export function canManagePublicContent(scope: AccessScope): boolean {
  return isExecutive(scope.role);
}

/** May read the audit log. */
export function canViewAuditLog(scope: AccessScope): boolean {
  return isExecutive(scope.role);
}

/** May change the program-wide weekly schedule and alert thresholds. */
export function canManageProgramSettings(scope: AccessScope): boolean {
  return isExecutive(scope.role);
}

/** May open the YÖNETİM AKIŞI management feed. */
export function canViewManagementFeed(scope: AccessScope): boolean {
  return isExecutive(scope.role) || isChapterHead(scope.role);
}

/** May create mentor meetings for a chapter. */
export function canManageMentorMeetings(scope: AccessScope, chapterId: string): boolean {
  return canManageChapter(scope, chapterId);
}
