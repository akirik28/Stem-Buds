import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isAdvisorTeacher } from '@/server/authz/policy';
import { listChannelsForViewer } from '@/server/services/messaging-service';
import { Card, EmptyState } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { channelTypeLabels } from '@/lib/i18n/tr';
import { formatRelativeTr } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Mesajlar',
  robots: { index: false, follow: false },
};

const TYPE_LABEL: Record<string, string> = {
  presidency: channelTypeLabels.presidency,
  chapter_management: channelTypeLabels.chapter_management,
  chapter_mentors: channelTypeLabels.chapter_mentors,
  group: 'Grup',
};

export default async function MessagesPage() {
  const context = await requireAuthContext();
  // Advisor Teacher is hard-blocked from every channel — see
  // `canAccessChannel`'s own doc comment; the route simply doesn't exist for
  // that role, matching the nav link already being absent.
  if (isAdvisorTeacher(context.scope.role)) redirect('/panel');

  const channels = await listChannelsForViewer(context.scope);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Mesajlar</h1>
        <p className="mt-1 text-sm text-navy-500">Yetkili olduğunuz kanallar.</p>
      </div>

      {channels.length === 0 ? (
        <EmptyState title="Henüz erişebileceğiniz bir kanal bulunmuyor." />
      ) : (
        <div className="space-y-2">
          {channels.map((channel) => (
            <Link key={channel.id} href={`/panel/mesajlar/${channel.id}`}>
              <Card className="flex items-center justify-between gap-3 hover:bg-sand-50">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-navy-900">{channel.name}</p>
                    <StatusPill tone="neutral">{TYPE_LABEL[channel.type] ?? channel.type}</StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-navy-400">
                    {channel.lastMessageAt ? `Son mesaj: ${formatRelativeTr(channel.lastMessageAt)}` : 'Henüz mesaj yok'}
                  </p>
                </div>
                {channel.unreadCount > 0 ? (
                  <StatusPill tone="info">{channel.unreadCount} yeni</StatusPill>
                ) : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
