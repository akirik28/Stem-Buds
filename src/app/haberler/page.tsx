import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLockup } from '@/components/brand/logo';
import { getCachedNewsPosts } from '@/server/cache/public-content';
import { formatDateTr } from '@/lib/format';
import { SiteFooter } from '../site-footer';

export const metadata: Metadata = {
  title: 'Haberler',
};

// News is database-backed. Rendering at request time avoids querying an empty
// production database during the first Railway build.
export const dynamic = 'force-dynamic';

export default async function NewsListPage() {
  const posts = await getCachedNewsPosts(50);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="bg-bg text-ink">
        <div className="container-page flex items-center justify-between py-5">
          <Link href="/" className="inline-flex rounded-lg">
            <BrandLockup tone="dark" />
          </Link>
          <Link href="/" className="text-sm font-medium text-ink hover:text-ink">
            ← Ana sayfa
          </Link>
        </div>
      </header>

      <main id="main" className="container-page flex-1 py-16">
        <h1 className="text-3xl font-semibold text-ink">Haberler</h1>

        {posts.length === 0 ? (
          <p className="mt-8 text-ink-3">Henüz yayınlanmış bir haber bulunmuyor.</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/haberler/${post.slug}`} className="block rounded-2xl bg-surface p-6 ring-1 ring-line-soft hover:ring-line">
                {post.publishedAt ? <p className="text-xs text-ink-3">{formatDateTr(post.publishedAt)}</p> : null}
                <h2 className="mt-2 text-base font-semibold text-ink">{post.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink-2">{post.summary}</p>
              </Link>
            ))}
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
