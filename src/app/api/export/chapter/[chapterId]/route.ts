import { NextResponse } from 'next/server';
import { requireAuthContext } from '@/server/auth/context';
import { canExportChapter } from '@/server/authz/policy';
import { getChapterById } from '@/server/services/chapter-service';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { buildChapterWorkbook } from '@/server/services/export-service';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { isAppError, toUserMessage } from '@/server/errors';

export async function GET(_request: Request, { params }: { params: Promise<{ chapterId: string }> }): Promise<NextResponse> {
  try {
    const { chapterId } = await params;
    const context = await requireAuthContext();

    if (!canExportChapter(context.scope, chapterId)) {
      return NextResponse.json({ error: 'Bu chapter için dışa aktarma yetkiniz yok.' }, { status: 403 });
    }

    const [chapter, academicYear] = await Promise.all([getChapterById(chapterId), getActiveAcademicYear()]);
    if (!chapter) return NextResponse.json({ error: 'Chapter bulunamadı.' }, { status: 404 });
    if (!academicYear) return NextResponse.json({ error: 'Aktif akademik yıl bulunamadı.' }, { status: 400 });

    const workbook = await buildChapterWorkbook(chapterId, academicYear.id);
    const buffer = await workbook.xlsx.writeBuffer();

    await recordAudit({
      actorUserId: context.user.id,
      actorName: context.user.fullName,
      action: AUDIT_ACTIONS.exportGenerated,
      targetType: 'export',
      targetLabel: `${chapter.code} raporu`,
      chapterId: chapter.id,
      academicYearId: academicYear.id,
    });

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${chapter.code}-rapor.xlsx"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: toUserMessage(error) }, { status: isAppError(error) ? error.status : 500 });
  }
}
