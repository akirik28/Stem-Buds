import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const bucketApi = {
    download: vi.fn(),
    remove: vi.fn(),
    upload: vi.fn(),
  };
  const storage = {
    createBucket: vi.fn(),
    from: vi.fn(() => bucketApi),
    listBuckets: vi.fn(),
  };
  return { bucketApi, createClient: vi.fn(() => ({ storage })), storage };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    STORAGE_BACKEND: 'supabase',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test-only',
    SUPABASE_STORAGE_BUCKET: 'stem-buds-private',
    UPLOAD_DIR: './storage',
  }),
}));

import {
  deleteStorageObject,
  ensureStorageBucket,
  readStorageObject,
  resetStorageClient,
  writeStorageObject,
} from '@/server/storage';

describe('Supabase Storage backend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStorageClient();
    mocks.storage.from.mockReturnValue(mocks.bucketApi);
  });

  it('creates the configured bucket privately with matching upload limits', async () => {
    mocks.storage.listBuckets.mockResolvedValue({ data: [], error: null });
    mocks.storage.createBucket.mockResolvedValue({ data: {}, error: null });

    await expect(ensureStorageBucket()).resolves.toBe('created');
    expect(mocks.storage.createBucket).toHaveBeenCalledWith('stem-buds-private', {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      fileSizeLimit: 4 * 1024 * 1024,
      public: false,
    });
  });

  it('does not recreate an existing bucket', async () => {
    mocks.storage.listBuckets.mockResolvedValue({
      data: [{ id: 'stem-buds-private' }],
      error: null,
    });

    await expect(ensureStorageBucket()).resolves.toBe('existing');
    expect(mocks.storage.createBucket).not.toHaveBeenCalled();
  });

  it('uploads, downloads and removes an object only through the private bucket', async () => {
    const bytes = Buffer.from('image-bytes');
    mocks.bucketApi.upload.mockResolvedValue({ data: {}, error: null });
    mocks.bucketApi.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    mocks.bucketApi.remove.mockResolvedValue({ data: [], error: null });

    await writeStorageObject({ storageKey: 'public-media/test.png', bytes, contentType: 'image/png' });
    expect(mocks.bucketApi.upload).toHaveBeenCalledWith(
      'public-media/test.png',
      expect.any(Uint8Array),
      { cacheControl: '86400', contentType: 'image/png', upsert: false },
    );

    await expect(readStorageObject('public-media/test.png')).resolves.toEqual(new Uint8Array(bytes));
    await deleteStorageObject('public-media/test.png');
    expect(mocks.bucketApi.remove).toHaveBeenCalledWith(['public-media/test.png']);
    expect(mocks.storage.from).toHaveBeenCalledWith('stem-buds-private');
  });
});
