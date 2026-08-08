import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canManageAccounts } from '@/server/authz/policy';
import { listUsers } from '@/server/services/user-admin';
import { listChapters } from '@/server/services/chapter-service';
import { listPrograms } from '@/server/services/program-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { roleLabels } from '@/lib/i18n/tr';
import { CreateUserForm } from './create-user-form';
import { UserRow } from './user-row';

export const metadata: Metadata = {
  title: 'Kullanıcılar',
  robots: { index: false, follow: false },
};

export default async function UsersPage() {
  const context = await requireAuthContext();
  if (!canManageAccounts(context.scope)) redirect('/panel');

  const [users, chapters, programs] = await Promise.all([listUsers(), listChapters(), listPrograms()]);

  const chapterOptions = chapters.map((chapter) => {
    const program = programs.find((p) => p.id === chapter.programId);
    return {
      id: chapter.id,
      label: `${chapter.code} — ${chapter.name}${program ? ` (${program.shortName})` : ''}`,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Kullanıcılar</h1>
        <p className="mt-1 text-sm text-navy-500">
          Hesaplar yalnızca burada, üst yönetim tarafından oluşturulur.
        </p>
      </div>

      <Card>
        <CardTitle>Yeni kullanıcı oluştur</CardTitle>
        <CreateUserForm chapterOptions={chapterOptions} />
      </Card>

      <Card>
        <CardTitle>Tüm kullanıcılar ({users.length})</CardTitle>
        {users.length === 0 ? (
          <EmptyState title="Henüz kullanıcı bulunmuyor." />
        ) : (
          <div className="mt-3 divide-y divide-navy-100">
            {users.map((user) => (
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
              />
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-navy-400">
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
