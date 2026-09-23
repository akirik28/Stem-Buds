import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';

/**
 * Class mode sits outside the panel on purpose.
 *
 * "The rest of the app should be unusable during the lesson" is not something
 * you achieve by hiding links — it is achieved by not rendering the panel at
 * all. There is no sidebar here, no navigation and nowhere to wander off to;
 * the panel comes back by itself once the window closes.
 */
export default async function ClassLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect('/giris');
  if (context.user.mustChangePassword) redirect('/sifre-belirle');

  return <div className="min-h-dvh bg-white">{children}</div>;
}
