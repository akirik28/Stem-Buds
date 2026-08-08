import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isAdvisorTeacher, isChapterHead, isExecutive } from '@/server/authz/policy';
import { canModerateChannel, getChannelForViewer, listChannelMessages, markChannelRead } from '@/server/services/messaging-service';
import { ChannelThread } from './channel-thread';

export const metadata: Metadata = {
  title: 'Mesajlar',
  robots: { index: false, follow: false },
};

export default async function ChannelThreadPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const context = await requireAuthContext();
  if (isAdvisorTeacher(context.scope.role)) redirect('/panel');

  const channel = await getChannelForViewer(context.scope, channelId);
  if (!channel) notFound();

  await markChannelRead(context.scope, channelId);
  const messages = await listChannelMessages(context.scope, channelId);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/panel/mesajlar" className="text-sm text-navy-500 hover:text-navy-700">
          ← Mesajlar
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-navy-900">{channel.name}</h1>
      </div>

      <ChannelThread
        channelId={channel.id}
        initialMessages={messages}
        canModerate={canModerateChannel(context.scope, channel)}
        canAnnounce={isExecutive(context.scope.role) || isChapterHead(context.scope.role)}
        currentUserId={context.user.id}
      />
    </div>
  );
}
