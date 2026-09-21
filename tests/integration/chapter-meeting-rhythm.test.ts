import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { managementAlerts } from '@/server/db/schema';
import { loadAccessScope } from '@/server/auth/context';
import { runAlertEvaluation } from '@/server/services/alert-engine';
import { createMentorMeeting } from '@/server/services/mentor-meeting-service';
import { createChapter } from '@/server/services/chapter-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { closeTestDb, resetDatabase } from '../helpers/db';

/**
 * A chapter is expected to hold a mentor meeting every two weeks. This rule
 * is unusual in the engine: it fires because something did *not* happen, so
 * the interesting cases are "never met at all" and "met, but too long ago".
 */

const actor = { id: null, name: 'test-suite' };

let academicYearId: string;
let chapterId: string;
let headId: string;

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function overdueAlerts() {
  return getDb()
    .select()
    .from(managementAlerts)
    .where(
      and(
        eq(managementAlerts.category, 'chapter_meeting_overdue'),
        eq(managementAlerts.chapterId, chapterId),
      ),
    );
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core program missing.');

  // The year must already be running for a rhythm to be measurable at all.
  const year = await createAcademicYear({
    label: '2026–2027',
    startDate: daysAgo(40),
    endDate: daysAgo(-260),
    activate: true,
    actor,
  });
  academicYearId = year.id;

  const chapter = await createChapter({ programId: online.id, code: 'UAA', name: 'Chapter A', actor });
  chapterId = chapter.id;

  headId = (
    await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId, academicYearId, actor })
  ).userId;
});

afterAll(async () => {
  await closeTestDb();
});

describe('chapter meeting rhythm', () => {
  it('flags a chapter that has never met this year, measuring from the year start', async () => {
    await runAlertEvaluation({ force: true });

    const alerts = await overdueAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.detail).toContain('henüz mentor toplantısı yapılmadı');
    expect(alerts[0]?.assignedRoleLabel).toBe('Chapter Head');
    // Chapter-scoped: no single group owns a cadence.
    expect(alerts[0]?.groupId).toBeNull();
  });

  it('escalates to red once two full rhythms have passed', async () => {
    await runAlertEvaluation({ force: true });
    const [alert] = await overdueAlerts();
    // 40 days elapsed is past 2 × 14.
    expect(alert?.severity).toBe('red');
  });

  it('resolves itself once a meeting is held inside the rhythm', async () => {
    await runAlertEvaluation({ force: true });
    expect((await overdueAlerts()).filter((a) => a.status === 'new')).toHaveLength(1);

    const headScope = await loadAccessScope(headId, 'chapter_head', academicYearId);
    await createMentorMeeting({
      scope: headScope,
      chapterId,
      academicYearId,
      title: 'Bu haftanın mentor toplantısı',
      startsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 3_600_000),
      actor: { id: headId, name: 'Head A' },
    });

    await runAlertEvaluation({ force: true });

    const open = (await overdueAlerts()).filter((a) => a.status === 'new' || a.status === 'investigating');
    expect(open).toHaveLength(0);
  });

  it('does not create a second alert when evaluated repeatedly', async () => {
    await runAlertEvaluation({ force: true });
    await runAlertEvaluation({ force: true });
    await runAlertEvaluation({ force: true });

    expect(await overdueAlerts()).toHaveLength(1);
  });
});
