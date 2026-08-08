import ExcelJS from 'exceljs';
import { and, count, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import {
  attendanceRecords,
  chapters,
  groupMemberships,
  groups,
  homeworkAssignments,
  homeworkStudentStatuses,
  users,
  weeklySessions,
} from '@/server/db/schema';
import { getProjectByGroupId } from './project-service';
import { disciplineLabels, roleLabels } from '@/lib/i18n/tr';

/**
 * Excel export — reuses `canExportChapter`/`canExportOrganization` (already
 * authorized in Phase 1-2, unused until now) rather than inventing a new
 * permission model. Every number here reads the same tables the rest of
 * the product already reads; nothing is recomputed with different logic.
 */

async function addGroupsSheet(workbook: ExcelJS.Workbook, chapterId: string, academicYearId: string, sheetName = 'Gruplar'): Promise<void> {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Grup', key: 'name', width: 18 },
    { header: 'Alan', key: 'discipline', width: 20 },
    { header: 'Mentor', key: 'mentor', width: 24 },
    { header: 'Üye Sayısı', key: 'memberCount', width: 12 },
    { header: 'Proje', key: 'project', width: 28 },
    { header: 'Proje Sağlığı', key: 'health', width: 14 },
  ];

  const db = getDb();
  const groupRows = await db.select().from(groups).where(and(eq(groups.chapterId, chapterId), eq(groups.academicYearId, academicYearId)));

  for (const group of groupRows) {
    const [mentor] = group.mentorUserId ? await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, group.mentorUserId)).limit(1) : [];
    const [countRow] = await db
      .select({ value: count() })
      .from(groupMemberships)
      .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.role, 'student'), eq(groupMemberships.isActive, true)));
    const project = await getProjectByGroupId(group.id, academicYearId);

    sheet.addRow({
      name: group.name,
      discipline: disciplineLabels[group.disciplineKey as keyof typeof disciplineLabels] ?? group.disciplineKey,
      mentor: mentor?.fullName ?? '—',
      memberCount: countRow?.value ?? 0,
      project: project?.name ?? '—',
      health: project?.health ?? '—',
    });
  }
}

async function addMembersSheet(workbook: ExcelJS.Workbook, chapterId: string, academicYearId: string, sheetName = 'Üyeler'): Promise<void> {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Ad Soyad', key: 'fullName', width: 24 },
    { header: 'Kullanıcı Adı', key: 'username', width: 20 },
    { header: 'Rol', key: 'role', width: 16 },
    { header: 'Grup', key: 'group', width: 18 },
    { header: 'Takım Lideri', key: 'teamLeader', width: 12 },
  ];

  const db = getDb();
  const rows = await db
    .select({
      fullName: users.fullName,
      username: users.username,
      role: users.role,
      groupName: groups.name,
      isTeamLeader: groupMemberships.isTeamLeader,
    })
    .from(groupMemberships)
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(groups, eq(groups.id, groupMemberships.groupId))
    .where(and(eq(groups.chapterId, chapterId), eq(groups.academicYearId, academicYearId), eq(groupMemberships.isActive, true)));

  for (const row of rows) {
    sheet.addRow({
      fullName: row.fullName,
      username: row.username,
      role: roleLabels[row.role],
      group: row.groupName,
      teamLeader: row.isTeamLeader ? 'Evet' : '',
    });
  }
}

async function addAttendanceSummarySheet(workbook: ExcelJS.Workbook, chapterId: string, academicYearId: string, sheetName = 'Katılım Özeti'): Promise<void> {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Ad Soyad', key: 'fullName', width: 24 },
    { header: 'Grup', key: 'group', width: 18 },
    { header: 'Katıldığı', key: 'attended', width: 10 },
    { header: 'Toplam', key: 'total', width: 10 },
    { header: 'Oran', key: 'rate', width: 10 },
  ];

  const db = getDb();
  const rows = await db
    .select({
      fullName: users.fullName,
      groupName: groups.name,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .innerJoin(groupMemberships, eq(groupMemberships.id, attendanceRecords.groupMembershipId))
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(weeklySessions, eq(weeklySessions.id, attendanceRecords.weeklySessionId))
    .innerJoin(groups, eq(groups.id, weeklySessions.groupId))
    .where(and(eq(groups.chapterId, chapterId), eq(groups.academicYearId, academicYearId)));

  const byStudent = new Map<string, { fullName: string; group: string; attended: number; total: number }>();
  for (const row of rows) {
    const key = `${row.fullName}::${row.groupName}`;
    const entry = byStudent.get(key) ?? { fullName: row.fullName, group: row.groupName, attended: 0, total: 0 };
    entry.total += 1;
    if (row.status === 'present' || row.status === 'late') entry.attended += 1;
    byStudent.set(key, entry);
  }

  for (const entry of byStudent.values()) {
    sheet.addRow({
      fullName: entry.fullName,
      group: entry.group,
      attended: entry.attended,
      total: entry.total,
      rate: entry.total > 0 ? `${Math.round((entry.attended / entry.total) * 100)}%` : '—',
    });
  }
}

async function addHomeworkSummarySheet(workbook: ExcelJS.Workbook, chapterId: string, academicYearId: string, sheetName = 'Ödev Özeti'): Promise<void> {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Ad Soyad', key: 'fullName', width: 24 },
    { header: 'Grup', key: 'group', width: 18 },
    { header: 'Tamamlanan', key: 'done', width: 12 },
    { header: 'Uygulanabilir', key: 'applicable', width: 14 },
    { header: 'Oran', key: 'rate', width: 10 },
  ];

  const db = getDb();
  const rows = await db
    .select({
      fullName: users.fullName,
      groupName: groups.name,
      status: homeworkStudentStatuses.status,
    })
    .from(homeworkStudentStatuses)
    .innerJoin(groupMemberships, eq(groupMemberships.id, homeworkStudentStatuses.groupMembershipId))
    .innerJoin(users, eq(users.id, groupMemberships.userId))
    .innerJoin(homeworkAssignments, eq(homeworkAssignments.id, homeworkStudentStatuses.assignmentId))
    .innerJoin(groups, eq(groups.id, homeworkAssignments.groupId))
    .where(and(eq(groups.chapterId, chapterId), eq(groups.academicYearId, academicYearId)));

  const byStudent = new Map<string, { fullName: string; group: string; done: number; applicable: number }>();
  for (const row of rows) {
    if (row.status === 'excused' || row.status === 'pending') continue;
    const key = `${row.fullName}::${row.groupName}`;
    const entry = byStudent.get(key) ?? { fullName: row.fullName, group: row.groupName, done: 0, applicable: 0 };
    entry.applicable += 1;
    if (row.status === 'done') entry.done += 1;
    byStudent.set(key, entry);
  }

  for (const entry of byStudent.values()) {
    sheet.addRow({
      fullName: entry.fullName,
      group: entry.group,
      done: entry.done,
      applicable: entry.applicable,
      rate: entry.applicable > 0 ? `${Math.round((entry.done / entry.applicable) * 100)}%` : '—',
    });
  }
}

export async function buildChapterWorkbook(chapterId: string, academicYearId: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STEM & BUDS';
  workbook.created = new Date();

  await addGroupsSheet(workbook, chapterId, academicYearId);
  await addMembersSheet(workbook, chapterId, academicYearId);
  await addAttendanceSummarySheet(workbook, chapterId, academicYearId);
  await addHomeworkSummarySheet(workbook, chapterId, academicYearId);

  return workbook;
}

export async function buildOrganizationWorkbook(academicYearId: string): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'STEM & BUDS';
  workbook.created = new Date();

  const allChapters = await getDb().select().from(chapters).where(eq(chapters.isActive, true));
  for (const chapter of allChapters) {
    const suffix = chapter.name.slice(0, 20);
    await addGroupsSheet(workbook, chapter.id, academicYearId, `Gruplar - ${suffix}`.slice(0, 31));
    await addMembersSheet(workbook, chapter.id, academicYearId, `Üyeler - ${suffix}`.slice(0, 31));
  }

  return workbook;
}
