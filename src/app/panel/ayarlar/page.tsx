import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { canManageProgramSettings, isExecutive } from '@/server/authz/policy';
import { listAcademicYears } from '@/server/services/academic-year';
import { getOrCreateProgramSettings, listPrograms } from '@/server/services/program-service';
import { Card, CardTitle } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { weekdayLabels } from '@/lib/i18n/tr';
import { CreateAcademicYearForm } from './create-academic-year-form';
import { AcademicYearRow } from './academic-year-row';
import { ProgramScheduleForm } from './program-schedule-form';

export const metadata: Metadata = {
  title: 'Ayarlar',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const context = await requireAuthContext();
  if (!isExecutive(context.scope.role)) redirect('/panel');

  const [years, programs] = await Promise.all([listAcademicYears(), listPrograms()]);
  const settingsByProgram = await Promise.all(
    programs.map(async (program) => ({ program, settings: await getOrCreateProgramSettings(program.id) })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Ayarlar</h1>
        <p className="mt-1 text-sm text-navy-500">Akademik yıl ve program takvimi.</p>
      </div>

      <Card>
        <CardTitle>Akademik Yıllar</CardTitle>
        <CreateAcademicYearForm />
        <div className="mt-4 divide-y divide-navy-100">
          {years.map((year) => (
            <AcademicYearRow
              key={year.id}
              year={{
                id: year.id,
                label: year.label,
                startDate: year.startDate,
                endDate: year.endDate,
                isActive: year.isActive,
              }}
            />
          ))}
        </div>
      </Card>

      {canManageProgramSettings(context.scope)
        ? settingsByProgram.map(({ program, settings }) => (
            <Card key={program.id}>
              <div className="flex items-center justify-between">
                <CardTitle>{program.name} — Program Ayarları</CardTitle>
                {!settings.configuredAt ? <StatusPill tone="neutral">Yapılandırılmadı</StatusPill> : null}
              </div>
              {!settings.weeklyDayOfWeek || settings.weeklyStartMinute === null ? (
                <p className="mt-2 text-sm text-navy-500">
                  Haftalık çalışma saati henüz belirlenmedi.
                </p>
              ) : (
                <p className="mt-2 text-sm text-navy-700">
                  {weekdayLabels[settings.weeklyDayOfWeek - 1]} günleri,{' '}
                  {String(Math.floor(settings.weeklyStartMinute / 60)).padStart(2, '0')}:
                  {String(settings.weeklyStartMinute % 60).padStart(2, '0')}
                  {settings.weeklyDurationMinutes ? ` (${settings.weeklyDurationMinutes} dakika)` : ''}
                </p>
              )}
              <ProgramScheduleForm programId={program.id} settings={settings} />
            </Card>
          ))
        : null}
    </div>
  );
}
