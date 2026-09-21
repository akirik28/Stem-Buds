import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isParent } from '@/server/authz/policy';
import { getChildOverview, listChildren } from '@/server/services/parent-service';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { ParentScopeBadge } from '../parent-scope-badge';
import { MonthlyDigestToggle, ParentMessageForm } from './contact-forms';

export const metadata: Metadata = {
  title: 'Yönetimle iletişim',
  robots: { index: false, follow: false },
};

export default async function ParentContactPage() {
  const context = await requireAuthContext();
  if (!isParent(context.scope.role)) redirect('/panel');

  const children = await listChildren(context.scope);
  if (children.length === 0) {
    return <EmptyState title="Henüz bağlı bir öğrenci bulunmuyor." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[30px]/[1.15] font-semibold tracking-[-0.02em] text-ink">
            Yönetimle iletişim
          </h1>
          <p className="mt-1 text-[13.5px] text-ink-3">
            Mesajlarınız başkan yardımcısına ve chapter sorumlusuna iletilir. Mentorlar lise
            öğrencisi olduğu için veli yazışmaları program yönetimi üzerinden yürür.
          </p>
        </div>
        <ParentScopeBadge />
      </div>

      {await Promise.all(
        children.map(async (child) => {
          const overview = await getChildOverview(context.scope, child.studentUserId);

          return (
            <section key={child.studentUserId} className="flex flex-col gap-4">
              <Card>
                <CardTitle>{overview.studentName}</CardTitle>
                <p className="mt-1 text-[12.5px] text-ink-3">
                  {overview.groupName ?? 'Grup atanmadı'}
                  {overview.chapterName ? ` · ${overview.chapterName}` : null}
                </p>

                <div className="mt-4">
                  <MonthlyDigestToggle
                    studentUserId={child.studentUserId}
                    enabled={child.monthlyDigestEnabled}
                    childName={overview.studentName.split(' ')[0] ?? overview.studentName}
                  />
                </div>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardTitle>Soru ilet</CardTitle>
                  <div className="mt-3.5">
                    <ParentMessageForm
                      studentUserId={child.studentUserId}
                      kind="question"
                      label="Sorunuz"
                      placeholder="Projede evde hangi malzemelere ihtiyaç olacak?"
                      helper="Program işleyişi, proje veya haftalık çalışmalar hakkındaki sorularınız için."
                    />
                  </div>
                </Card>

                <Card>
                  <CardTitle>Mazeret bildir</CardTitle>
                  <div className="mt-3.5">
                    <ParentMessageForm
                      studentUserId={child.studentUserId}
                      kind="excuse"
                      label="Mazeret"
                      placeholder="Cumartesi günü şehir dışında olacağız, oturuma katılamayacak."
                      helper="Önceden bildirilen mazeretler devamsızlık olarak sayılmaz."
                    />
                  </div>
                </Card>
              </div>
            </section>
          );
        }),
      )}
    </div>
  );
}
