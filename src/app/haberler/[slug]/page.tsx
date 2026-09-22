import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandLockup } from '@/components/brand/logo';
import { getCachedNewsPostBySlug } from '@/server/cache/public-content';
import { formatDateTr } from '@/lib/format';
import { SiteFooter } from '../../site-footer';

// News is database-backed. Rendering at request time avoids a build-time
// dependency on the production database and keeps publish changes immediate.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getCachedNewsPostBySlug(slug);
  return { title: post?.title ?? 'Haber' };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getCachedNewsPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-ink">
      <header className="bg-bg text-ink">
        <div className="container-page flex items-center justify-between py-5">
          <Link href="/" className="inline-flex rounded-lg">
            <BrandLockup tone="dark" />
          </Link>
          <Link href="/haberler" className="text-sm font-medium text-ink hover:text-ink">
            ← Haberler
          </Link>
        </div>
      </header>

      <main id="main" className="container-page flex-1 py-16">
        <article className="mx-auto max-w-2xl">
          {post.publishedAt ? <p className="text-sm text-ink-3">{formatDateTr(post.publishedAt)}</p> : null}
          <h1 className="mt-2 text-3xl font-semibold text-ink">{post.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-2">{post.summary}</p>
          <div className="mt-8 whitespace-pre-wrap leading-relaxed text-ink-2">{post.body}</div>
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}
