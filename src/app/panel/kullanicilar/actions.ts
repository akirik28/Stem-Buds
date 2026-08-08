'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthContext, assertPermission } from '@/server/auth/context';
import { canAssignRole, canManageAccounts, type UserRole } from '@/server/authz/policy';
import {
  changeUserRole,
  createUser,
  deactivateUser,
  reactivateUser,
  resetTemporaryPassword,
} from '@/server/services/user-admin';
import { toUserMessage } from '@/server/errors';

export type ActionState = {
  error?: string;
  success?: string;
  /** Shown once, immediately after creation/reset — never persisted client-side beyond this. */
  credential?: { username: string; temporaryPassword: string };
};

export async function createUserAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageAccounts(context.scope));

  const role = String(formData.get('role') ?? '') as UserRole;
  const chapterId = String(formData.get('chapterId') ?? '') || null;
  const academicYearId = context.academicYearId;

  try {
    const created = await createUser({
      username: String(formData.get('username') ?? ''),
      fullName: String(formData.get('fullName') ?? ''),
      role,
      notificationEmail: String(formData.get('notificationEmail') ?? '') || null,
      chapterId,
      academicYearId,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/kullanicilar');
    return { credential: { username: created.username, temporaryPassword: created.temporaryPassword } };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function resetPasswordAction(targetUserId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageAccounts(context.scope));

  try {
    const reset = await resetTemporaryPassword({
      targetUserId,
      actor: { id: context.user.id, name: context.user.fullName },
    });
    revalidatePath('/panel/kullanicilar');
    return { credential: { username: reset.username, temporaryPassword: reset.temporaryPassword } };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function deactivateUserAction(targetUserId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageAccounts(context.scope));

  try {
    await deactivateUser({ targetUserId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath('/panel/kullanicilar');
    return { success: 'Hesap pasifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function reactivateUserAction(targetUserId: string): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageAccounts(context.scope));

  try {
    await reactivateUser({ targetUserId, actor: { id: context.user.id, name: context.user.fullName } });
    revalidatePath('/panel/kullanicilar');
    return { success: 'Hesap yeniden aktifleştirildi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}

export async function changeRoleAction(targetUserId: string, newRole: UserRole): Promise<ActionState> {
  const context = await requireAuthContext();
  assertPermission(canManageAccounts(context.scope));
  assertPermission(canAssignRole(context.scope, newRole));

  try {
    await changeUserRole({
      targetUserId,
      newRole,
      actor: { id: context.user.id, name: context.user.fullName, role: context.user.role },
    });
    revalidatePath('/panel/kullanicilar');
    return { success: 'Rol güncellendi.' };
  } catch (error) {
    return { error: toUserMessage(error) };
  }
}
