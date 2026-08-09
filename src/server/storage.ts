import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/server/env';

const ALLOWED_STORAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const STORAGE_FILE_SIZE_LIMIT = 4 * 1024 * 1024;

let supabaseClient: ReturnType<typeof createClient> | undefined;

function getSupabaseClient(): ReturnType<typeof createClient> {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Supabase Storage is not configured.');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

function resolveFilesystemKey(storageKey: string): { uploadDir: string; filePath: string } {
  const uploadDir = path.resolve(getEnv().UPLOAD_DIR);
  const filePath = path.resolve(uploadDir, storageKey);
  if (filePath !== uploadDir && !filePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw new Error('Invalid storage key.');
  }
  return { uploadDir, filePath };
}

export async function writeStorageObject(input: {
  storageKey: string;
  bytes: Buffer;
  contentType: string;
}): Promise<void> {
  const env = getEnv();
  if (env.STORAGE_BACKEND === 'filesystem') {
    const { filePath } = resolveFilesystemKey(input.storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, input.bytes);
    return;
  }

  const { error } = await getSupabaseClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .upload(input.storageKey, new Uint8Array(input.bytes), {
      cacheControl: '86400',
      contentType: input.contentType,
      upsert: false,
    });
  if (error) throw new Error('The file could not be stored.');
}

export async function readStorageObject(storageKey: string): Promise<Uint8Array | null> {
  const env = getEnv();
  if (env.STORAGE_BACKEND === 'filesystem') {
    try {
      return await readFile(resolveFilesystemKey(storageKey).filePath);
    } catch {
      return null;
    }
  }

  const { data, error } = await getSupabaseClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .download(storageKey);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteStorageObject(storageKey: string): Promise<void> {
  const env = getEnv();
  if (env.STORAGE_BACKEND === 'filesystem') {
    await unlink(resolveFilesystemKey(storageKey).filePath).catch(() => undefined);
    return;
  }

  await getSupabaseClient().storage.from(env.SUPABASE_STORAGE_BUCKET).remove([storageKey]);
}

/** Idempotently creates the private bucket used by Vercel production. */
export async function ensureStorageBucket(): Promise<'filesystem' | 'existing' | 'created'> {
  const env = getEnv();
  if (env.STORAGE_BACKEND === 'filesystem') return 'filesystem';

  const client = getSupabaseClient();
  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error('Supabase Storage buckets could not be checked.');
  if (buckets.some((bucket) => bucket.id === env.SUPABASE_STORAGE_BUCKET)) return 'existing';

  const { error: createError } = await client.storage.createBucket(env.SUPABASE_STORAGE_BUCKET, {
    allowedMimeTypes: ALLOWED_STORAGE_MIME_TYPES,
    fileSizeLimit: STORAGE_FILE_SIZE_LIMIT,
    public: false,
  });
  if (createError) throw new Error('Supabase Storage bucket could not be created.');
  return 'created';
}

/** Test helper: drops the cached SDK client after environment changes. */
export function resetStorageClient(): void {
  supabaseClient = undefined;
}
