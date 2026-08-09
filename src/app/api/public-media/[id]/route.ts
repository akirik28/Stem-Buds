import { NextResponse } from 'next/server';
import { readStorageObject } from '@/server/storage';
import { getPublicMediaById } from '@/server/services/public-site-service';

/**
 * Serves a `public_media` row's file. Deliberately unauthenticated — every
 * row in this table was explicitly uploaded for public display (see the
 * schema's own doc comment) — but still resolved by `storageKey` looked up
 * server-side from the row, never a client-supplied object path.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const media = await getPublicMediaById(id);
  if (!media) return NextResponse.json({ error: 'Görsel bulunamadı.' }, { status: 404 });

  const bytes = await readStorageObject(media.storageKey);
  if (!bytes) return NextResponse.json({ error: 'Görsel bulunamadı.' }, { status: 404 });

  return new NextResponse(bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': media.contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
