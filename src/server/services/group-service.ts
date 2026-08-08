import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { groupMemberships, groups, users } from '@/server/db/schema';
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
 */
export async function createGroup(input: CreateGroupInput): Promise<Group> {
  const codePrefix = disciplineCodes[input.disciplineKey];
  if (!codePrefix) throw validationError('Geçersiz disiplin.');

  return getDb().transaction(async (tx) => {
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
