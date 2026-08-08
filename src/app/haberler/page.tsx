import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLockup } from '@/components/brand/logo';
import { listPublishedNewsPosts } from '@/server/services/public-site-service';
import { formatDateTr } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Haberler',
};

export const revalidate = 60;

export default async function NewsListPage() {
  const posts = await listPublishedNewsPosts(50);

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50 text-navy-900">
      <header className="bg-navy-900 text-white">
        <div className="container-page flex items-center justify-between py-5">
          <Link href="/" className="inline-flex rounded-lg">
            <BrandLockup tone="dark" />
          </Link>
          <Link href="/" className="text-sm font-medium text-navy-100 hover:text-white">
            ← Ana sayfa
          </Link>
        </div>
      </header>

      <main id="main" className="container-page flex-1 py-16">
        <h1 className="text-3xl font-semibold text-navy-900">Haberler</h1>

        {posts.length === 0 ? (
          <p className="mt-8 text-navy-500">Henüz yayınlanmış bir haber bulunmuyor.</p>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link key={post.id} href={`/haberler/${post.slug}`} className="block rounded-2xl bg-white p-6 ring-1 ring-navy-100 hover:ring-navy-300">
                {post.publishedAt ? <p className="text-xs text-navy-400">{formatDateTr(post.publishedAt)}</p> : null}
                <h2 className="mt-2 text-base font-semibold text-navy-900">{post.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-navy-600">{post.summary}</p>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="bg-navy-950 py-8 text-sm text-navy-400">
        <div className="container-page">
          <p>© {new Date().getFullYear()} STEM &amp; BUDS Türkiye</p>
        </div>
      </footer>
    </div>
  );
}
