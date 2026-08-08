'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { Select } from '@/components/ui/form';
import { StatusPill } from '@/components/ui/status';
import { formatRelativeTr } from '@/lib/format';
import { roleLabels } from '@/lib/i18n/tr';
import type { UserRole } from '@/server/authz/policy';
import {
  changeRoleAction,
  deactivateUserAction,
  reactivateUserAction,
  resetPasswordAction,
  type ActionState,
} from './actions';
import { CredentialReveal } from './credential-reveal';

export type UserRowData = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

const ALL_ROLES: UserRole[] = ['student', 'mentor', 'chapter_head', 'vice_president', 'regional_director'];

export function UserRow({
  user,
  canAssignExecutive,
}: {
  user: UserRowData;
  canAssignExecutive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome);
      setConfirmingDeactivate(false);
    });
  }

  const assignableRoles = canAssignExecutive
    ? ALL_ROLES
    : ALL_ROLES.filter((role) => !['vice_president', 'regional_director'].includes(role));

  return (
    <div className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-navy-900">{user.fullName}</p>
          <p className="text-sm text-navy-500">
            @{user.username} · {roleLabels[user.role]}
          </p>
          <p className="text-xs text-navy-400">
            {user.lastLoginAt
              ? `Son giriş: ${formatRelativeTr(user.lastLoginAt)}`
              : 'Henüz giriş yapmadı'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.isActive ? (
            <StatusPill tone="ok" icon="✅">
              Aktif
            </StatusPill>
          ) : (
            <StatusPill tone="danger" icon="🚫">
              Pasif
            </StatusPill>
          )}
          {user.isActive && user.mustChangePassword ? (
            <StatusPill tone="neutral" icon="⏳">
              Şifre değiştirilmedi
            </StatusPill>
          ) : null}

          <Select
            aria-label="Rol değiştir"
            className="min-h-9 w-auto py-1 text-sm"
            defaultValue={user.role}
            disabled={pending}
            onChange={(event) => {
              const newRole = event.target.value as UserRole;
              if (newRole === user.role) return;
              run(() => changeRoleAction(user.id, newRole));
            }}
          >
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </Select>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => resetPasswordAction(user.id))}
          >
            Şifreyi sıfırla
          </Button>

          {user.isActive ? (
            confirmingDeactivate ? (
              <>
                <span className="text-xs text-navy-500">Emin misiniz?</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => deactivateUserAction(user.id))}
                >
                  Evet, pasifleştir
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDeactivate(false)}
                >
                  Vazgeç
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmingDeactivate(true)}
              >
                Pasifleştir
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => reactivateUserAction(user.id))}
            >
              Yeniden aktifleştir
            </Button>
          )}
        </div>
      </div>

      {result?.error ? (
        <Alert tone="error" className="mt-3">
          {result.error}
        </Alert>
      ) : null}
      {result?.success ? (
        <Alert tone="success" className="mt-3">
          {result.success}
        </Alert>
      ) : null}
      {result?.credential ? (
        <CredentialReveal credential={result.credential} title="Yeni geçici şifre oluşturuldu" />
      ) : null}
    </div>
  );
}
