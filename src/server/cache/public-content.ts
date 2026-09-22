import { unstable_cache } from 'next/cache';
import { listPrograms } from '@/server/services/program-service';
import {
  getPublishedNewsPostBySlug,
  listPublicHighlights,
  listPublicLeadershipProfiles,
  listPublishedNewsPosts,
} from '@/server/services/public-site-service';

/**
 * The public site's reads, memoised.
 *
 * Every public page is `force-dynamic` on purpose: a production build must
 * never depend on an already-migrated database, and published CMS content
 * has to appear without a redeploy. Rendering per request is cheap; what is
 * not cheap is going to PostgreSQL per request. The home page alone makes
 * four queries, and the pool holds five connections per instance, so a few
 * dozen simultaneous visitors exhaust it and everyone after them waits for
 * a connection that never comes.
 *
 * Caching here rather than on the page keeps both properties: the render
 * still happens at request time, and the database is read at most once per
 * `TTL_SECONDS` per region instead of once per visitor. An editor's change
 * shows up within that window.
 */

/** One minute: fast enough that publishing feels immediate, long enough that
 *  a burst of visitors costs one query rather than hundreds. */
const TTL_SECONDS = 60;

/** Anything the site editor can change shares this tag, so a future
 *  `revalidateTag` from the CMS can clear the whole public site at once. */
export const PUBLIC_CONTENT_TAG = 'public-content';

const options = { revalidate: TTL_SECONDS, tags: [PUBLIC_CONTENT_TAG] };

export const getCachedPrograms = unstable_cache(
  () => listPrograms(),
  ['public:programs'],
  options,
);

export const getCachedHighlights = unstable_cache(
  () => listPublicHighlights(),
  ['public:highlights'],
  options,
);

export const getCachedLeadership = unstable_cache(
  () => listPublicLeadershipProfiles(),
  ['public:leadership'],
  options,
);

export const getCachedNewsPosts = unstable_cache(
  (limit: number) => listPublishedNewsPosts(limit),
  ['public:news'],
  options,
);

export const getCachedNewsPostBySlug = unstable_cache(
  (slug: string) => getPublishedNewsPostBySlug(slug),
  ['public:news-post'],
  options,
);
