import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getEnv } from '@/server/env';
import { getPublicMediaById } from '@/server/services/public-site-service';

/**
 * Serves a `public_media` row's file. Deliberately unauthenticated — every
 * row in this table was explicitly uploaded for public display (see the
 * schema's own doc comment) — but still resolved by `storageKey` looked up
 * server-side from the row, never a client-supplied path, so a request can
 * never read an arbitrary file off disk.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  const media = await getPublicMediaById(id);
  if (!media) return NextResponse.json({ error: 'Görsel bulunamadı.' }, { status: 404 });

  const uploadDir = path.resolve(getEnv().UPLOAD_DIR);
  const filePath = path.resolve(uploadDir, media.storageKey);
  if (!filePath.startsWith(uploadDir)) {
    return NextResponse.json({ error: 'Görsel bulunamadı.' }, { status: 404 });
  }

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': media.contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Görsel bulunamadı.' }, { status: 404 });
  }
}
