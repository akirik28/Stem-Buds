import { NextResponse } from 'next/server';
import { requireAuthContext } from '@/server/auth/context';
import { canExportOrganization } from '@/server/authz/policy';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { buildOrganizationWorkbook } from '@/server/services/export-service';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { isAppError, toUserMessage } from '@/server/errors';

export async function GET(): Promise<NextResponse> {
  try {
    const context = await requireAuthContext();

    if (!canExportOrganization(context.scope)) {
      return NextResponse.json({ error: 'Bu dışa aktarma için yetkiniz yok.' }, { status: 403 });
    }

    const academicYear = await getActiveAcademicYear();
    if (!academicYear) return NextResponse.json({ error: 'Aktif akademik yıl bulunamadı.' }, { status: 400 });

    const workbook = await buildOrganizationWorkbook(academicYear.id);
    const buffer = await workbook.xlsx.writeBuffer();

    await recordAudit({
      actorUserId: context.user.id,
      actorName: context.user.fullName,
      action: AUDIT_ACTIONS.exportGenerated,
      targetType: 'export',
      targetLabel: 'Organizasyon raporu',
      academicYearId: academicYear.id,
    });

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="stem-buds-rapor.xlsx"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: toUserMessage(error) }, { status: isAppError(error) ? error.status : 500 });
  }
}
