import type { Metadata } from 'next';
import { requireAuthContext } from '@/server/auth/context';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { roleDescriptions, roleLabels } from '@/lib/i18n/tr';

export const metadata: Metadata = {
  title: 'Panelim',
  robots: { index: false, follow: false },
};

export default async function PanelHomePage() {
  const context = await requireAuthContext();
  const academicYear = await getActiveAcademicYear();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">
          Merhaba {context.user.fullName.split(' ')[0]},
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          {roleLabels[context.user.role]} — {roleDescriptions[context.user.role]}
        </p>
      </div>

      <Card>
        <CardTitle>Akademik yıl</CardTitle>
        <p className="mt-2 text-sm text-navy-700">
          {academicYear
            ? `Aktif dönem: ${academicYear.label}`
            : 'Henüz aktif bir akademik yıl tanımlanmadı.'}
        </p>
      </Card>

      <EmptyState
        title="Panel içerikleri hazırlanıyor."
        description="Haftalık çalışmalar, ödevler ve proje takibi sıradaki adımlarda bu ekrana eklenecek."
      />
    </div>
  );
}
