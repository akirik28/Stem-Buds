import './load-env';
import { ensureStorageBucket } from '../src/server/storage';

async function main(): Promise<void> {
  const result = await ensureStorageBucket();
  if (result === 'created') console.log('Private Supabase Storage bucket created.');
  if (result === 'existing') console.log('Private Supabase Storage bucket is ready.');
  if (result === 'filesystem') console.log('Filesystem storage selected; remote bucket setup skipped.');
}

main().catch(() => {
  console.error('Storage setup failed. Check the server-side Supabase configuration.');
  process.exit(1);
});
