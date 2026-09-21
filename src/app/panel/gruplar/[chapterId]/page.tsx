import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canExportChapter, canManageChapter, canViewChapter } from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { listGroupsByChapter } from '@/server/services/group-service';
import { Card, EmptyState } from '@/components/ui/card';
import { messages } from '@/lib/i18n/tr';
import { ChapterLifecycleControls } from '../chapter-lifecycle-controls';

export const metadata: Metadata = {
  title: 'Chapter Grupları',
  robots: { index: false, follow: false },
};

export default async function ChapterGroupsPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const { chapterId } = await params;
  const context = await requireAuthContext();

  const chapter = await getChapterById(chapterId);
  if (!chapter) notFound();
  if (!canViewChapter(context.scope, chapter.id)) redirect('/panel/gruplar');
  if (!context.academicYearId) {
    return (
      <EmptyState
        title="Aktif akademik yıl bulunmuyor."
        description="Grup oluşturmadan önce Ayarlar sayfasından bir akademik yıl aktifleştirin."
      />
    );
  }

  const groups = await listGroupsByChapter(chapter.id, context.academicYearId);
  const canManage = canManageChapter(context.scope, chapter.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/panel/gruplar" className="text-sm text-ink-3 hover:text-ink-2">
            ← Gruplar
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-ink">{chapter.name}</h1>
          <p className="text-sm text-ink-3">{chapter.code}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canExportChapter(context.scope, chapter.id) ? (
            <a
              href={`/api/export/chapter/${chapter.id}`}
              className="inline-flex min-h-9 items-center rounded-lg bg-surface px-3.5 text-sm font-medium text-ink-2 ring-1 ring-inset ring-line hover:bg-surface-2"
            >
              Excel’e Aktar
            </a>
          ) : null}
          {canManage ? (
            <ChapterLifecycleControls chapterId={chapter.id} isActive={chapter.isActive} />
          ) : null}
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState title={messages.empty.noGroups} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Link key={group.id} href={`/panel/gruplar/${chapter.id}/${group.id}`}>
              <Card className="h-full transition-colors hover:ring-line">
                <p className="font-semibold text-ink">{group.name}</p>
                {!group.isActive ? <p className="mt-1 text-xs text-ink-3">Pasif</p> : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
