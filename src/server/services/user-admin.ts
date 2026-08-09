import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import { advisorProgramScopes, chapterMemberships, groupMemberships, groups, profiles, users } from '@/server/db/schema';
import { conflict, notFound, validationError } from '@/server/errors';
import { destroyAllSessionsForUser } from '@/server/auth/session';
import { checkPasswordPolicy, generateTemporaryPassword, hashPassword } from '@/server/auth/password';
import { EXECUTIVE_ROLES, isExecutive, type UserRole } from '@/server/authz/policy';
import { AUDIT_ACTIONS, recordAudit } from './audit';
import { sendEmail } from './email-service';
import type { EmailProvider } from '@/server/email/provider';

/**
 * Account administration.
 *
 * There is no public self-registration: every account is created here by
 * Executive Management. The temporary password is returned to the caller
 * exactly once and never stored, e-mailed or audited.
 */

export type CreateUserInput = {
  username: string;
  fullName: string;
  role: UserRole;
  notificationEmail?: string | null;
  chapterId?: string | null;
  academicYearId?: string | null;
  /** Only meaningful for `advisor_teacher` — which Program(s) they may observe. */
  programIds?: string[];
  actor: { id: string | null; name: string };
  /** Injected only by tests; production always uses the env-selected e-mail provider. */
  emailProvider?: EmailProvider;
  /** Internal deployment bootstrap only; normal account creation stays random. */
  temporaryPassword?: string;
};

export type CreatedUser = {
  userId: string;
  username: string;
  /** Shown once, at creation time. Not persisted anywhere. */
  temporaryPassword: string;
};

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{1,62})[a-z0-9]$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLocaleLowerCase('tr');
}

export function assertValidUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw validationError(
      'Kullanıcı adı 3-64 karakter olmalı; yalnızca küçük harf, rakam, nokta, tire ve alt çizgi içerebilir.',
    );
  }
}

export async function createUser(input: CreateUserInput): Promise<CreatedUser> {
  const username = normalizeUsername(input.username);
  assertValidUsername(username);

  const fullName = input.fullName.trim();
  if (fullName.length < 2) throw validationError('Ad soyad zorunludur.');

  if (input.role === 'chapter_head' || input.role === 'mentor' || input.role === 'student') {
    if (!input.chapterId || !input.academicYearId) {
      throw validationError('Bu rol için chapter ve akademik yıl seçilmelidir.');
    }
  }
  if (input.role === 'advisor_teacher' && (!input.programIds || input.programIds.length === 0)) {
    throw validationError('Danışman Öğretmen için en az bir program seçilmelidir.');
  }

  const temporaryPassword = input.temporaryPassword ?? generateTemporaryPassword();
  if (input.temporaryPassword && !checkPasswordPolicy(temporaryPassword, username).ok) {
    throw validationError('İlk yönetici parolası güvenlik koşullarını karşılamıyor.');
  }
  const passwordHash = await hashPassword(temporaryPassword);
  const db = getDb();

  const userId = await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = ${username}`)
      .limit(1);
    if (existing.length > 0) throw conflict('Bu kullanıcı adı zaten kullanılıyor.');

    const [created] = await tx
      .insert(users)
      .values({
        username,
        fullName,
        role: input.role,
        notificationEmail: input.notificationEmail?.trim() || null,
        passwordHash,
        mustChangePassword: true,
      })
      .returning({ id: users.id });

    if (!created) throw conflict('Kullanıcı oluşturulamadı.');

    await tx.insert(profiles).values({ userId: created.id });

    if (input.chapterId && input.academicYearId) {
      await tx.insert(chapterMemberships).values({
        userId: created.id,
        chapterId: input.chapterId,
        academicYearId: input.academicYearId,
        role: input.role,
      });
    }

    if (input.role === 'advisor_teacher' && input.programIds && input.programIds.length > 0) {
      await tx
        .insert(advisorProgramScopes)
        .values(input.programIds.map((programId) => ({ userId: created.id, programId })));
    }

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.userCreated,
        targetType: 'user',
        targetId: created.id,
        targetLabel: username,
        chapterId: input.chapterId ?? null,
        academicYearId: input.academicYearId ?? null,
        after: { username, fullName, role: input.role, programIds: input.programIds ?? null },
      },
      tx,
    );

    return created.id;
  });

  // Never the temporary password itself — see this file's own doc comment:
  // it is returned to the caller exactly once and never e-mailed. Best-
  // effort only: a delivery problem must never fail account creation, which
  // has already committed by this point.
  const notificationEmail = input.notificationEmail?.trim();
  if (notificationEmail) {
    try {
      await sendEmail({
        idempotencyKey: `welcome:${userId}`,
        template: 'welcome',
        recipientEmail: notificationEmail,
        recipientUserId: userId,
        subject: 'STEM & BUDS hesabınız oluşturuldu',
        body: `Merhaba ${fullName},\n\nSTEM & BUDS platformunda sizin için bir hesap oluşturuldu. Kullanıcı adınız: ${username}\n\nGiriş bilgilerinizi yöneticinizden öğrenebilirsiniz.`,
        relatedEntityType: 'user',
        relatedEntityId: userId,
        provider: input.emailProvider,
      });
    } catch {
      // Swallowed deliberately: see comment above.
    }
  }

  return { userId, username, temporaryPassword };
}

/**
 * Issues a new temporary password. The issuance is audited; the password is not.
 */
export async function resetTemporaryPassword(input: {
  targetUserId: string;
  actor: { id: string | null; name: string };
}): Promise<{ username: string; temporaryPassword: string }> {
  const db = getDb();
  const [target] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.id, input.targetUserId))
    .limit(1);
  if (!target) throw validationError('Kullanıcı bulunamadı.');

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, mustChangePassword: true, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.passwordResetIssued,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.username,
      },
      tx,
    );
  });

  return { username: target.username, temporaryPassword };
}

/** True when at least one Executive Management account exists. */
export async function executiveExists(db: Database = getDb()): Promise<boolean> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, [...EXECUTIVE_ROLES]))
    .limit(1);
  return rows.length > 0;
}

export type ListedUser = typeof users.$inferSelect;

export async function listUsers(filter: { role?: UserRole } = {}): Promise<ListedUser[]> {
  const db = getDb();
  const query = db.select().from(users).orderBy(desc(users.createdAt));
  if (filter.role) {
    return query.where(eq(users.role, filter.role));
  }
  return query;
}

export async function getUserById(id: string): Promise<ListedUser | null> {
  const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

/**
 * Deactivates an account: it can no longer sign in, every existing session is
 * revoked immediately, and its history (attendance, audit trail, ...) is kept.
 */
export async function deactivateUser(input: {
  targetUserId: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);
  if (!target) throw notFound('Kullanıcı bulunamadı.');
  if (target.id === input.actor.id) {
    throw validationError('Kendi hesabınızı pasifleştiremezsiniz.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isActive: false, deactivatedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, target.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.userDeactivated,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.username,
      },
      tx,
    );
  });

  await destroyAllSessionsForUser(target.id);
}

export async function reactivateUser(input: {
  targetUserId: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);
    if (!target) throw notFound('Kullanıcı bulunamadı.');

    await tx
      .update(users)
      .set({ isActive: true, deactivatedAt: null, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.userReactivated,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.username,
      },
      tx,
    );
  });
}

/**
 * Changes a user's platform-wide role.
 *
 * A Chapter Head must never be able to promote anyone into an executive
 * role — enforced by the caller via `canAssignRole`, and defensively here too:
 * this function is only ever reachable from an executive-only server action.
 */
export async function changeUserRole(input: {
  targetUserId: string;
  newRole: UserRole;
  actor: { id: string | null; name: string; role: UserRole };
}): Promise<void> {
  if (isExecutive(input.newRole) && !isExecutive(input.actor.role)) {
    throw validationError('Yalnızca üst yönetim, bir hesabı üst yönetim rolüne atayabilir.');
  }

  await getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);
    if (!target) throw notFound('Kullanıcı bulunamadı.');

    await tx
      .update(users)
      .set({ role: input.newRole, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    // Chapter/group memberships recorded under the previous role are left as
    // history; an operator re-assigns chapter/group scope separately when a
    // role change also changes what the person should have access to.
    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.userRoleChanged,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.username,
        before: { role: target.role },
        after: { role: input.newRole },
      },
      tx,
    );
  });

  await destroyAllSessionsForUser(input.targetUserId);
}

export async function listAdvisorProgramIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ programId: advisorProgramScopes.programId })
    .from(advisorProgramScopes)
    .where(eq(advisorProgramScopes.userId, userId));
  return rows.map((r) => r.programId);
}

/**
 * Replaces an Advisor Teacher's full set of observed Programs. Idempotent —
 * safe to call with the same set repeatedly.
 */
export async function setAdvisorProgramScopes(input: {
  userId: string;
  programIds: string[];
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, input.userId)).limit(1);
    if (!target) throw notFound('Kullanıcı bulunamadı.');
    if (target.role !== 'advisor_teacher') {
      throw validationError('Yalnızca Danışman Öğretmen rolündeki kullanıcılar için program ataması yapılabilir.');
    }

    const before = await tx
      .select({ programId: advisorProgramScopes.programId })
      .from(advisorProgramScopes)
      .where(eq(advisorProgramScopes.userId, input.userId));

    await tx.delete(advisorProgramScopes).where(eq(advisorProgramScopes.userId, input.userId));
    if (input.programIds.length > 0) {
      await tx
        .insert(advisorProgramScopes)
        .values(input.programIds.map((programId) => ({ userId: input.userId, programId })));
    }

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.advisorProgramsChanged,
        targetType: 'user',
        targetId: input.userId,
        before: { programIds: before.map((r) => r.programId) },
        after: { programIds: input.programIds },
      },
      tx,
    );
  });
}

/**
 * Hard-deletes a user account — safe only for a truly unused/test account:
 * never logged in, no chapter or group membership ever recorded, and not
 * assigned as any group's mentor. Anyone with real participation history
 * must be deactivated instead (`deactivateUser`), which keeps their
 * identity attached to their historical records and only revokes access.
 */
export async function deleteUser(input: {
  targetUserId: string;
  actor: { id: string | null; name: string };
}): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);
    if (!target) throw notFound('Kullanıcı bulunamadı.');
    if (target.id === input.actor.id) {
      throw validationError('Kendi hesabınızı silemezsiniz.');
    }
    if (target.lastLoginAt !== null) {
      throw validationError('Daha önce giriş yapmış bir hesap silinemez; bunun yerine pasifleştirin.');
    }

    const [chapterMembership] = await tx
      .select({ id: chapterMemberships.id })
      .from(chapterMemberships)
      .where(eq(chapterMemberships.userId, input.targetUserId))
      .limit(1);
    const [groupMembership] = await tx
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(eq(groupMemberships.userId, input.targetUserId))
      .limit(1);
    const [mentoredGroup] = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(eq(groups.mentorUserId, input.targetUserId))
      .limit(1);
    if (chapterMembership || groupMembership || mentoredGroup) {
      throw validationError('Bu kullanıcının katılım geçmişi var; silmek yerine pasifleştirin.');
    }

    await tx.delete(users).where(eq(users.id, input.targetUserId));

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.userDeleted,
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.username,
        before: { username: target.username, role: target.role },
      },
      tx,
    );
  });
}
