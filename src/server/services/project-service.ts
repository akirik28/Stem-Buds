import { and, eq } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { groups, milestones, projects, users, weeklySessions, weeklyWorkLogs } from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { buildProjectJourney, type JourneyEntry } from '@/server/domain/project-journey';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type Project = typeof projects.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;

type Actor = { id: string | null; name: string };
type ProjectHealth = 'on_track' | 'attention' | 'delayed';
type MilestoneStatus = 'planned' | 'in_progress' | 'completed';

export async function getProjectById(id: string): Promise<Project | null> {
  const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

export async function getProjectByGroupId(
  groupId: string,
  academicYearId: string,
): Promise<Project | null> {
  const [row] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.groupId, groupId), eq(projects.academicYearId, academicYearId)))
    .limit(1);
  return row ?? null;
}

export type CreateProjectInput = {
  groupId: string;
  academicYearId: string;
  name: string;
  shortDescription?: string | null;
  researchQuestion?: string | null;
  purpose?: string | null;
  startDate?: string | null;
  actor: Actor;
};

/** Creates the group's one primary project for the academic year. */
export async function createProject(input: CreateProjectInput): Promise<Project> {
  const name = input.name.trim();
  if (name.length < 2) throw validationError('Proje adı en az 2 karakter olmalı.');

  return getDb().transaction(async (tx) => {
    const [group] = await tx.select().from(groups).where(eq(groups.id, input.groupId)).limit(1);
    if (!group) throw notFound('Grup bulunamadı.');

    const [existing] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.groupId, input.groupId), eq(projects.academicYearId, input.academicYearId)))
      .limit(1);
    if (existing) throw conflict('Bu grup için bu akademik yılda zaten bir proje var.');

    const [created] = await tx
      .insert(projects)
      .values({
        groupId: input.groupId,
        academicYearId: input.academicYearId,
        name,
        shortDescription: input.shortDescription?.trim() || null,
        researchQuestion: input.researchQuestion?.trim() || null,
        purpose: input.purpose?.trim() || null,
        startDate: input.startDate || null,
      })
      .returning();
    if (!created) throw conflict('Proje oluşturulamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.projectCreated,
        targetType: 'project',
        targetId: created.id,
        targetLabel: created.name,
        after: { groupId: input.groupId, name },
      },
      tx,
    );

    return created;
  });
}

export type UpdateProjectDetailsInput = {
  projectId: string;
  name?: string;
  shortDescription?: string | null;
  researchQuestion?: string | null;
  purpose?: string | null;
  startDate?: string | null;
  actor: Actor;
};

export async function updateProjectDetails(input: UpdateProjectDetailsInput): Promise<Project> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!before) throw notFound('Proje bulunamadı.');

    const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      if (trimmed.length < 2) throw validationError('Proje adı en az 2 karakter olmalı.');
      patch.name = trimmed;
    }
    if (input.shortDescription !== undefined) patch.shortDescription = input.shortDescription?.trim() || null;
    if (input.researchQuestion !== undefined) patch.researchQuestion = input.researchQuestion?.trim() || null;
    if (input.purpose !== undefined) patch.purpose = input.purpose?.trim() || null;
    if (input.startDate !== undefined) patch.startDate = input.startDate || null;

    const [updated] = await tx.update(projects).set(patch).where(eq(projects.id, input.projectId)).returning();
    if (!updated) throw notFound('Proje bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.projectUpdated,
        targetType: 'project',
        targetId: updated.id,
        targetLabel: updated.name,
        before: { name: before.name },
        after: { name: updated.name },
      },
      tx,
    );

    return updated;
  });
}

export async function updateProjectStatus(input: {
  projectId: string;
  health: ProjectHealth;
  actor: Actor;
}): Promise<Project> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!before) throw notFound('Proje bulunamadı.');

    const [updated] = await tx
      .update(projects)
      .set({ health: input.health, updatedAt: new Date() })
      .where(eq(projects.id, input.projectId))
      .returning();
    if (!updated) throw notFound('Proje bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.projectStatusEdited,
        targetType: 'project',
        targetId: updated.id,
        targetLabel: updated.name,
        before: { health: before.health },
        after: { health: updated.health },
      },
      tx,
    );

    return updated;
  });
}

export type UpdateProjectOutcomeInput = {
  projectId: string;
  outcomeSummary?: string | null;
  finalDelivered?: boolean;
  externalReferenceUrl?: string | null;
  actor: Actor;
};

export async function updateProjectOutcome(input: UpdateProjectOutcomeInput): Promise<Project> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!before) throw notFound('Proje bulunamadı.');

    const patch: Partial<typeof projects.$inferInsert> = { updatedAt: new Date() };
    if (input.outcomeSummary !== undefined) patch.outcomeSummary = input.outcomeSummary?.trim() || null;
    if (input.externalReferenceUrl !== undefined) {
      patch.externalReferenceUrl = input.externalReferenceUrl?.trim() || null;
    }
    if (input.finalDelivered !== undefined) {
      patch.finalDelivered = input.finalDelivered;
      patch.finalDeliveredAt = input.finalDelivered ? (before.finalDeliveredAt ?? new Date()) : null;
    }

    const [updated] = await tx.update(projects).set(patch).where(eq(projects.id, input.projectId)).returning();
    if (!updated) throw notFound('Proje bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.projectUpdated,
        targetType: 'project',
        targetId: updated.id,
        targetLabel: updated.name,
        before: { finalDelivered: before.finalDelivered },
        after: { finalDelivered: updated.finalDelivered },
      },
      tx,
    );

    return updated;
  });
}

export async function getMilestoneById(id: string): Promise<Milestone | null> {
  const [row] = await getDb().select().from(milestones).where(eq(milestones.id, id)).limit(1);
  return row ?? null;
}

export async function listMilestonesByProject(projectId: string): Promise<Milestone[]> {
  return getDb()
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(milestones.orderIndex, milestones.createdAt);
}

export type AddMilestoneInput = {
  projectId: string;
  title: string;
  description?: string | null;
  dueDate?: string | null;
  actor: Actor;
};

export async function addMilestone(input: AddMilestoneInput): Promise<Milestone> {
  const title = input.title.trim();
  if (title.length < 2) throw validationError('Milestone başlığı en az 2 karakter olmalı.');

  return getDb().transaction(async (tx) => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).limit(1);
    if (!project) throw notFound('Proje bulunamadı.');

    const existing = await tx
      .select({ orderIndex: milestones.orderIndex })
      .from(milestones)
      .where(eq(milestones.projectId, input.projectId));
    const nextOrder = existing.reduce((max, m) => Math.max(max, m.orderIndex), -1) + 1;

    const [created] = await tx
      .insert(milestones)
      .values({
        projectId: input.projectId,
        title,
        description: input.description?.trim() || null,
        dueDate: input.dueDate || null,
        orderIndex: nextOrder,
        createdById: input.actor.id,
      })
      .returning();
    if (!created) throw conflict('Milestone oluşturulamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.milestoneCreated,
        targetType: 'milestone',
        targetId: created.id,
        targetLabel: created.title,
        after: { projectId: input.projectId, title },
      },
      tx,
    );

    return created;
  });
}

export async function updateMilestoneStatus(input: {
  milestoneId: string;
  status: MilestoneStatus;
  actor: Actor;
}): Promise<Milestone> {
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(milestones).where(eq(milestones.id, input.milestoneId)).limit(1);
    if (!before) throw notFound('Milestone bulunamadı.');

    const [updated] = await tx
      .update(milestones)
      .set({
        status: input.status,
        completedAt: input.status === 'completed' ? (before.completedAt ?? new Date()) : null,
        updatedAt: new Date(),
      })
      .where(eq(milestones.id, input.milestoneId))
      .returning();
    if (!updated) throw notFound('Milestone bulunamadı.');

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.milestoneStatusChanged,
        targetType: 'milestone',
        targetId: updated.id,
        targetLabel: updated.title,
        before: { status: before.status },
        after: { status: updated.status },
      },
      tx,
    );

    return updated;
  });
}

/**
 * Deletes a milestone that never accumulated any history. Authorization
 * (creator-only, plus RD/VP override) is enforced by the caller via
 * `canDeleteMilestone` — this function enforces the historical-data safety
 * net: a milestone that was ever marked completed is never destroyed, only
 * the ownership/scope check above decides *who* may call this at all.
 */
export async function deleteMilestone(input: { milestoneId: string; actor: Actor }): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [milestone] = await tx.select().from(milestones).where(eq(milestones.id, input.milestoneId)).limit(1);
    if (!milestone) throw notFound('Milestone bulunamadı.');
    if (milestone.completedAt !== null) {
      throw validationError('Tamamlanmış bir milestone silinemez; geçmiş kaydı korunur.');
    }

    await tx.delete(milestones).where(eq(milestones.id, input.milestoneId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.milestoneDeleted,
        targetType: 'milestone',
        targetId: milestone.id,
        targetLabel: milestone.title,
        before: { title: milestone.title, projectId: milestone.projectId },
      },
      tx,
    );
  });
}

/**
 * The project's timeline, generated only from finalized weekly records and
 * completed milestones — see `buildProjectJourney` for the exact rule.
 */
export async function getProjectJourney(groupId: string, projectId: string): Promise<JourneyEntry[]> {
  const db: Database = getDb();

  const sessionRows = await db
    .select({
      weekNumber: weeklySessions.weekNumber,
      scheduledStartAt: weeklySessions.scheduledStartAt,
      whatWeDid: weeklyWorkLogs.whatWeDid,
      outputs: weeklyWorkLogs.outputs,
      problems: weeklyWorkLogs.problems,
      nextWeekGoal: weeklyWorkLogs.nextWeekGoal,
      completedAt: weeklyWorkLogs.completedAt,
      authorName: users.fullName,
    })
    .from(weeklySessions)
    .innerJoin(weeklyWorkLogs, eq(weeklyWorkLogs.weeklySessionId, weeklySessions.id))
    .leftJoin(users, eq(users.id, weeklyWorkLogs.draftAuthorId))
    .where(eq(weeklySessions.groupId, groupId));

  const milestoneRows = await db
    .select({ title: milestones.title, completedAt: milestones.completedAt })
    .from(milestones)
    .where(eq(milestones.projectId, projectId));

  return buildProjectJourney(sessionRows, milestoneRows);
}
