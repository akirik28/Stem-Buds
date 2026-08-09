import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canManagePublicContent } from '@/server/authz/policy';
import {
  listAllHighlights,
  listAllLeadershipProfiles,
  listAllMedia,
  listAllNewsPosts,
  listContactMessages,
} from '@/server/services/public-site-admin-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { CreateHighlightForm } from './create-highlight-form';
import { HighlightRow } from './highlight-row';
import { CreateLeadershipForm } from './create-leadership-form';
import { LeadershipRow } from './leadership-row';
import { CreateNewsForm } from './create-news-form';
import { NewsRow } from './news-row';
import { MediaUploadForm } from './media-upload-form';
import { MediaRow } from './media-row';
import { ContactMessageRow } from './contact-message-row';

export const metadata: Metadata = {
  title: 'Site İçerikleri',
  robots: { index: false, follow: false },
};

export default async function PublicSiteContentPage() {
  const context = await requireAuthContext();
  if (!canManagePublicContent(context.scope)) redirect('/panel');

  const [highlights, leadership, news, media, messages] = await Promise.all([
    listAllHighlights(),
    listAllLeadershipProfiles(),
    listAllNewsPosts(),
    listAllMedia(),
    listContactMessages(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Site İçerikleri</h1>
        <p className="mt-1 text-sm text-navy-500">Genel siteyi (anasayfa, haberler, iletişim) yönetin.</p>
      </div>

      <Card>
        <CardTitle>Öne Çıkanlar</CardTitle>
        <div className="mt-3">
          <CreateHighlightForm />
        </div>
        {highlights.length === 0 ? (
          <p className="mt-4 text-sm text-navy-500">Henüz öne çıkan içerik eklenmedi.</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy-100">
            {highlights.map((highlight) => (
              <HighlightRow key={highlight.id} highlight={highlight} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Yönetim Ekibi</CardTitle>
        <div className="mt-3">
          <CreateLeadershipForm />
        </div>
        {leadership.length === 0 ? (
          <p className="mt-4 text-sm text-navy-500">Henüz yönetim profili eklenmedi.</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy-100">
            {leadership.map((profile) => (
              <LeadershipRow key={profile.id} profile={profile} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Haberler</CardTitle>
        <div className="mt-3">
          <CreateNewsForm />
        </div>
        {news.length === 0 ? (
          <p className="mt-4 text-sm text-navy-500">Henüz haber eklenmedi.</p>
        ) : (
          <ul className="mt-4 divide-y divide-navy-100">
            {news.map((post) => (
              <NewsRow
                key={post.id}
                post={{
                  id: post.id,
                  slug: post.slug,
                  title: post.title,
                  summary: post.summary,
                  body: post.body,
                  isPublished: post.isPublished,
                  publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
                }}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Görseller</CardTitle>
        <div className="mt-3">
          <MediaUploadForm />
        </div>
        {media.length === 0 ? (
          <p className="mt-4 text-sm text-navy-500">Henüz görsel yüklenmedi.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {media.map((item) => (
              <MediaRow key={item.id} media={item} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>İletişim Mesajları</CardTitle>
        {messages.length === 0 ? (
          <EmptyState title="Henüz mesaj yok" description="Genel siteden gelen iletişim formu mesajları burada görünecek." />
        ) : (
          <ul className="mt-4 divide-y divide-navy-100">
            {messages.map((item) => (
              <ContactMessageRow
                key={item.id}
                item={{
                  id: item.id,
                  fullName: item.fullName,
                  email: item.email,
                  phone: item.phone,
                  reason: item.reason,
                  message: item.message,
                  handledAt: item.handledAt ? item.handledAt.toISOString() : null,
                  createdAt: item.createdAt.toISOString(),
                }}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
