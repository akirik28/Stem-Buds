import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isStudent } from '@/server/authz/policy';
import { getGroupById } from '@/server/services/group-service';
import { getPendingFeedbackCycleForStudent } from '@/server/services/feedback-service';
import { Card, CardTitle } from '@/components/ui/card';
import { CycleResponseForm } from './cycle-response-form';
import { ContinuousFeedbackForm } from './continuous-feedback-form';
import { ComplaintForm } from './complaint-form';

export const metadata: Metadata = {
  title: 'Geri Bildirim',
  robots: { index: false, follow: false },
};

/**
 * The Student's (Team Leader included — same account role) "voice" surface:
 * the periodic structured "Son üç çalışmayı değerlendir" cycle when one is
 * pending, plus the always-available continuous feedback and confidential
 * complaint channels. No other role submits any of these — see the schema's
 * own doc comments ("chosen by a student").
 */
export default async function StudentFeedbackPage() {
  const context = await requireAuthContext();
  if (!isStudent(context.scope.role)) redirect('/panel');

  const [pendingCycle, groups] = await Promise.all([
    getPendingFeedbackCycleForStudent(context.scope),
    Promise.all(context.scope.studentGroupIds.map((id) => getGroupById(id))),
  ]);
  const groupOptions = groups.filter((g): g is NonNullable<typeof g> => g !== null).map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Geri Bildirim</h1>
        <p className="mt-1 text-sm text-navy-500">Sesin bize ulaşsın.</p>
      </div>

      {pendingCycle ? (
        <Card>
          <CardTitle>Son üç çalışmayı değerlendir</CardTitle>
          <p className="mt-1 text-sm text-navy-500">Son 3 tamamlanan haftalık çalışma hakkında kısa bir değerlendirme.</p>
          <div className="mt-4">
            <CycleResponseForm cycleId={pendingCycle.id} />
          </div>
        </Card>
      ) : null}

      <Card>
        <CardTitle>💬 Geri Bildirim Gönder</CardTitle>
        <p className="mt-1 text-sm text-navy-500">Mentor, grup, program veya platform hakkında düşüncelerini paylaş.</p>
        <div className="mt-4">
          <ContinuousFeedbackForm groups={groupOptions} />
        </div>
      </Card>

      <Card>
        <CardTitle>⚠️ Şikâyet Bildir</CardTitle>
        <p className="mt-1 text-sm text-navy-500">Ciddi bir sorun mu var? Gizli olarak bildir.</p>
        <div className="mt-4">
          <ComplaintForm />
        </div>
      </Card>
    </div>
  );
}
