import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { chapterMemberships, chapters, groupMemberships, groups, users } from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { disciplineCodes, type DisciplineKey } from '@/lib/i18n/tr';
import type { UserRole } from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type Group = typeof groups.$inferSelect;
export type GroupMembership = typeof groupMemberships.$inferSelect;

export async function listGroupsByChapter(chapterId: string, academicYearId: string): Promise<Group[]> {
  return getDb()
    .select()
    .from(groups)
    .where(and(eq(groups.chapterId, chapterId), eq(groups.academicYearId, academicYearId)))
    .orderBy(groups.disciplineKey, groups.sequence);
}

export async function getGroupById(id: string): Promise<Group | null> {
  const [row] = await getDb().select().from(groups).where(eq(groups.id, id)).limit(1);
  return row ?? null;
}

/**
 * Every group in one program, across all its chapters — the query-level half
 * of the "Tüm Programlar / Online Ortaokul Programı / BİLSEM Programı"
 * switcher for cross-chapter, program-wide views (dashboards, exports).
 *
 * Like `listChapters`'s `programId` filter, this is not an authorization
 * boundary: callers must still intersect the result with the caller's scope.
 */
export async function listGroupsByProgram(programId: string, academicYearId: string): Promise<Group[]> {
  return getDb()
    .select()
    .from(groups)
    .where(and(eq(groups.programId, programId), eq(groups.academicYearId, academicYearId)))
    .orderBy(groups.chapterId, groups.disciplineKey, groups.sequence);
}

export type CreateGroupInput = {
  chapterId: string;
  academicYearId: string;
  disciplineKey: DisciplineKey;
  /** Explicit sequence, or omitted to auto-assign the next free number. */
  sequence?: number;
  actor: { id: string | null; name: string };
};

/**
 * Creates a group, auto-naming it from discipline + sequence (e.g. "Bio 1").
 *
 * When `sequence` is omitted, the next free number for that discipline inside
 * the chapter/year is computed and used — this still races safely because the
 * database's unique constraint on (chapter, year, discipline, sequence) is the
 * real guarantee; a collision here surfaces as a clear conflict, not silent
 * corruption.
 *
 * `programId` is not accepted as input: it is read from the parent chapter and
 * copied onto the group, so a group can never end up scoped to a different
 * program than the chapter it lives in.
 */
export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const codePrefix = disciplineCodes[input.disciplineKey];
  if (!codePrefix) throw validationError('Geçersiz disiplin.');

  return getDb().transaction(async (tx) => {
    const [chapter] = await tx
      .select({ id: chapters.id, programId: chapters.programId })
      .from(chapters)
      .where(eq(chapters.id, input.chapterId))
      .limit(1);
    if (!chapter) throw notFound('Chapter bulunamadı.');

    let sequence = input.sequence;
    if (sequence === undefined) {
      const existing = await tx
        .select({ sequence: groups.sequence })
        .from(groups)
        .where(
          and(
            eq(groups.chapterId, input.chapterId),
            eq(groups.academicYearId, input.academicYearId),
            eq(groups.disciplineKey, input.disciplineKey),
          ),
        );
      sequence = existing.reduce((max, row) => Math.max(max, row.sequence), 0) + 1;
    }
    if (sequence < 1) throw validationError('Sıra numarası 1 veya daha büyük olmalı.');

    const name = `${codePrefix} ${sequence}`;

    const duplicate = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(
        and(
          eq(groups.chapterId, input.chapterId),
          eq(groups.academicYearId, input.academicYearId),
          eq(groups.disciplineKey, input.disciplineKey),
          eq(groups.sequence, sequence),
        ),
      );
    if (duplicate.length > 0) {
      throw conflict(`${name} bu chapter için bu akademik yılda zaten mevcut.`);
    }

    const [created] = await tx
      .insert(groups)
      .values({
        programId: chapter.programId,
        chapterId: input.chapterId,
        academicYearId: input.academicYearId,
        disciplineKey: input.disciplineKey,
        sequence,
        name,
      })
      .returning();
    if (!created) throw conflict('Grup oluşturulamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupCreated,
        targetType: 'group',
        targetId: created.id,
        targetLabel: created.name,
        chapterId: input.chapterId,
        academicYearId: input.academicYearId,
        after: { name, disciplineKey: input.disciplineKey, sequence },
      },
      tx,
    );

    return created;
  });
}

export type AssignGroupMentorInput = {
  groupId: string;
  mentorUserId: string;
  actor: { id: string | null; name: string };
};

/**
 * Assigns (or replaces) a group's single authoritative mentor.
 *
 * ONE group has exactly one assigned mentor once operational; ONE mentor may
 * be assigned to several groups. A group with no mentor is a draft and is
 * never treated as operational — nothing here creates or touches sessions,
 * attendance, homework, or messages (those belong to their own phases), so
 * reassigning a mentor can never lose that data because none of it is
 * scoped by mentor identity; it stays keyed to the group itself.
 *
 * The previous mentor's `group_memberships` row (if any) is deactivated —
 * not deleted — so history is preserved and `AccessScope.mentorGroupIds`
 * (what actually gates the previous mentor's access to this group's data)
 * stops including this group immediately.
 */
export async function assignGroupMentor(input: AssignGroupMentorInput): Promise<Group> {
  return getDb().transaction(async (tx) => {
    const [group] = await tx.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
    if (!group) throw notFound('Grup bulunamadı.');

    const [mentor] = await tx.select().from(users).where(eq(users.id, input.mentorUserId)).limit(1);
    if (!mentor) throw notFound('Kullanıcı bulunamadı.');
    if (mentor.role !== 'mentor') {
      throw validationError('Yalnızca Mentor rolündeki bir kullanıcı gruba atanabilir.');
    }
    if (!mentor.isActive) {
      throw validationError('Pasif bir kullanıcı gruba mentor olarak atanamaz.');
    }

    const [chapterMembership] = await tx
      .select({ id: chapterMemberships.id })
      .from(chapterMemberships)
      .where(
        and(
          eq(chapterMemberships.userId, mentor.id),
          eq(chapterMemberships.chapterId, group.chapterId),
          eq(chapterMemberships.academicYearId, group.academicYearId),
          eq(chapterMemberships.isActive, true),
        ),
      )
      .limit(1);
    if (!chapterMembership) {
      throw validationError('Mentor, bu grubun bağlı olduğu chapter’a atanmış olmalıdır.');
    }

    if (group.mentorUserId === mentor.id) {
      return group; // Already the assigned mentor — idempotent no-op.
    }

    const previousMentorId = group.mentorUserId;

    if (previousMentorId) {
      await tx
        .update(groupMemberships)
        .set({ isActive: false, leftAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(groupMemberships.groupId, group.id),
            eq(groupMemberships.userId, previousMentorId),
            eq(groupMemberships.role, 'mentor'),
          ),
        );
    }

    const [existingMembership] = await tx
      .select()
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.userId, mentor.id)))
      .limit(1);

    if (existingMembership) {
      await tx
        .update(groupMemberships)
        .set({ role: 'mentor', isActive: true, leftAt: null, updatedAt: new Date() })
        .where(eq(groupMemberships.id, existingMembership.id));
    } else {
      await tx.insert(groupMemberships).values({ groupId: group.id, userId: mentor.id, role: 'mentor' });
    }

    const [updated] = await tx
      .update(groups)
      .set({ mentorUserId: mentor.id, updatedAt: new Date() })
      .where(eq(groups.id, group.id))
      .returning();
    if (!updated) throw notFound('Grup bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupMentorAssigned,
        targetType: 'group',
        targetId: group.id,
        targetLabel: group.name,
        chapterId: group.chapterId,
        academicYearId: group.academicYearId,
        before: { mentorUserId: previousMentorId },
        after: { mentorUserId: mentor.id },
      },
      tx,
    );

    return updated;
  });
}

export type GroupMemberWithUser = GroupMembership & {
  username: string;
  fullName: string;
  /** The user's platform-wide role, distinct from `GroupMembership.role` (mentor/student in this group). */
  accountRole: UserRole;
};

export async function listGroupMembers(groupId: string): Promise<GroupMemberWithUser[]> {
  const rows = await getDb()
    .select({
      membership: groupMemberships,
      username: users.username,
      fullName: users.fullName,
      accountRole: users.role,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.isActive, true)))
    .orderBy(desc(groupMemberships.role), users.fullName);

  return rows.map((row) => ({
    ...row.membership,
    username: row.username,
    fullName: row.fullName,
    accountRole: row.accountRole,
  }));
}

export type AddGroupMemberInput = {
  groupId: string;
  userId: string;
  role: 'mentor' | 'student';
  isTeamLeader?: boolean;
  actor: { id: string | null; name: string };
};

export async function addGroupMember(input: AddGroupMemberInput): Promise<GroupMembership> {
  return getDb().transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, input.groupId), eq(groupMemberships.userId, input.userId)))
      .limit(1);

    let membership: GroupMembership;
    if (existing[0]) {
      const [updated] = await tx
        .update(groupMemberships)
        .set({
          role: input.role,
          isTeamLeader: input.isTeamLeader ?? false,
          isActive: true,
          leftAt: null,
          updatedAt: new Date(),
        })
        .where(eq(groupMemberships.id, existing[0].id))
        .returning();
      if (!updated) throw conflict('Üyelik güncellenemedi.');
      membership = updated;
    } else {
      const [created] = await tx
        .insert(groupMemberships)
        .values({
          groupId: input.groupId,
          userId: input.userId,
          role: input.role,
          isTeamLeader: input.isTeamLeader ?? false,
        })
        .returning();
      if (!created) throw conflict('Üyelik oluşturulamadı.');
      membership = created;
    }

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupMembershipChanged,
        targetType: 'group_membership',
        targetId: membership.id,
        after: { groupId: input.groupId, userId: input.userId, role: input.role },
      },
      tx,
    );

    return membership;
  });
}

export type RemoveGroupMemberInput = {
  membershipId: string;
  actor: { id: string | null; name: string };
};

export async function removeGroupMember(input: RemoveGroupMemberInput): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(groupMemberships)
      .where(eq(groupMemberships.id, input.membershipId))
      .limit(1);
    if (!before) throw notFound('Üyelik bulunamadı.');

    await tx
      .update(groupMemberships)
      .set({ isActive: false, leftAt: new Date(), updatedAt: new Date() })
      .where(eq(groupMemberships.id, input.membershipId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupMembershipChanged,
        targetType: 'group_membership',
        targetId: before.id,
        before: { groupId: before.groupId, userId: before.userId, role: before.role },
        after: { isActive: false },
      },
      tx,
    );
  });
}

/**
 * Sets whether a student membership carries the Team Leader permission.
 * Never touches global role — Team Leader stays a group-scoped extra grant.
 */
export async function setTeamLeader(input: {
  membershipId: string;
  isTeamLeader: boolean;
  actor: { id: string | null; name: string };
}): Promise<GroupMembership> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(groupMemberships)
      .where(eq(groupMemberships.id, input.membershipId))
      .limit(1);
    if (!before) throw notFound('Üyelik bulunamadı.');
    if (before.role !== 'student') {
      throw validationError('Yalnızca öğrenci üyeliklerine Takım Lideri yetkisi verilebilir.');
    }

    const [updated] = await tx
      .update(groupMemberships)
      .set({ isTeamLeader: input.isTeamLeader, updatedAt: new Date() })
      .where(eq(groupMemberships.id, input.membershipId))
      .returning();
    if (!updated) throw notFound('Üyelik bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupMembershipChanged,
        targetType: 'group_membership',
        targetId: updated.id,
        before: { isTeamLeader: before.isTeamLeader },
        after: { isTeamLeader: updated.isTeamLeader },
      },
      tx,
    );

    return updated;
  });
}

/** Archives a group (`isActive = false`) — preserves it and all its history. */
export async function archiveGroup(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<Group> {
  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(groups)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(groups.id, input.id))
      .returning();
    if (!updated) throw notFound('Grup bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupArchived,
        targetType: 'group',
        targetId: updated.id,
        targetLabel: updated.name,
      },
      tx,
    );
    return updated;
  });
}

export async function reactivateGroup(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<Group> {
  return getDb().transaction(async (tx) => {
    const [updated] = await tx
      .update(groups)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(groups.id, input.id))
      .returning();
    if (!updated) throw notFound('Grup bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupReactivated,
        targetType: 'group',
        targetId: updated.id,
        targetLabel: updated.name,
      },
      tx,
    );
    return updated;
  });
}

/**
 * Hard-deletes a group, unconditionally — every foreign key on `group_id`
 * (memberships, weekly sessions, homework, projects, channels, ...) is
 * `CASCADE` at the database level, so this always removes the group and
 * everything scoped to it.
 */
export async function deleteGroup(input: {
  id: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(groups).where(eq(groups.id, input.id)).limit(1);
    if (!target) throw notFound('Grup bulunamadı.');

    await tx.delete(groups).where(eq(groups.id, input.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.groupDeleted,
        targetType: 'group',
        targetId: target.id,
        targetLabel: target.name,
        before: { name: target.name },
      },
      tx,
    );
  });
}
