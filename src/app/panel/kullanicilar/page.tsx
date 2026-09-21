import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canManageAccounts } from '@/server/authz/policy';
import { listAdvisorProgramIds, listUsers } from '@/server/services/user-admin';
import { listPrograms } from '@/server/services/program-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { roleLabels } from '@/lib/i18n/tr';
import { UserRow } from './user-row';

export const metadata: Metadata = {
  title: 'Kullanıcılar',
  robots: { index: false, follow: false },
};

export default async function UsersPage() {
  const context = await requireAuthContext();
  if (!canManageAccounts(context.scope)) redirect('/panel');

  const [users, programs] = await Promise.all([listUsers(), listPrograms()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-ink-3">
          Mevcut hesaplar. Yeni hesap açmak için üst yönetime başvurun.
        </p>
      </div>

      <Card>
        <CardTitle>Tüm kullanıcılar ({users.length})</CardTitle>
        {users.length === 0 ? (
          <EmptyState title="Henüz kullanıcı bulunmuyor." />
        ) : (
          <div className="mt-3 divide-y divide-line-soft">
            {await Promise.all(
              users.map(async (user) => (
                <UserRow
                  key={user.id}
                  user={{
                    id: user.id,
                    username: user.username,
                    fullName: user.fullName,
                    role: user.role,
                    isActive: user.isActive,
                    mustChangePassword: user.mustChangePassword,
                    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
                  }}
                  canAssignExecutive={context.user.role !== 'chapter_head'}
                  programOptions={programs.map((program) => ({ id: program.id, label: program.shortName }))}
                  currentProgramIds={user.role === 'advisor_teacher' ? await listAdvisorProgramIds(user.id) : []}
                />
              )),
            )}
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-3">
        Roller: {Object.values(roleLabels).join(', ')}.
      </p>
      <StatusPillLegend />
    </div>
  );
}

function StatusPillLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      <StatusPill tone="ok" icon="✅">
        Aktif
      </StatusPill>
      <StatusPill tone="neutral" icon="⏳">
        Şifre değiştirilmedi
      </StatusPill>
      <StatusPill tone="danger" icon="🚫">
        Pasif
      </StatusPill>
    </div>
  );
}
