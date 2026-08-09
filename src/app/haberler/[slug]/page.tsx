import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BrandLockup } from '@/components/brand/logo';
import { getPublishedNewsPostBySlug } from '@/server/services/public-site-service';
import { formatDateTr } from '@/lib/format';

// News is database-backed. Rendering at request time avoids a build-time
// dependency on the production database and keeps publish changes immediate.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedNewsPostBySlug(slug);
  return { title: post?.title ?? 'Haber' };
}

export default async function NewsDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedNewsPostBySlug(slug);
  if (!post) notFound();

  return (
    <div className="flex min-h-dvh flex-col bg-sand-50 text-navy-900">
      <header className="bg-navy-900 text-white">
        <div className="container-page flex items-center justify-between py-5">
          <Link href="/" className="inline-flex rounded-lg">
            <BrandLockup tone="dark" />
          </Link>
          <Link href="/haberler" className="text-sm font-medium text-navy-100 hover:text-white">
            ← Haberler
          </Link>
        </div>
      </header>

      <main id="main" className="container-page flex-1 py-16">
        <article className="mx-auto max-w-2xl">
          {post.publishedAt ? <p className="text-sm text-navy-400">{formatDateTr(post.publishedAt)}</p> : null}
          <h1 className="mt-2 text-3xl font-semibold text-navy-900">{post.title}</h1>
          <p className="mt-4 text-lg leading-relaxed text-navy-600">{post.summary}</p>
          <div className="mt-8 whitespace-pre-wrap leading-relaxed text-navy-700">{post.body}</div>
        </article>
      </main>

      <footer className="bg-navy-950 py-8 text-sm text-navy-400">
        <div className="container-page">
          <p>© {new Date().getFullYear()} STEM &amp; BUDS Türkiye</p>
        </div>
      </footer>
    </div>
  );
}
