import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import {
  AUDIT_ACTIONS,
  countAuditLogs,
  listAuditLogs,
  listDistinctAuditActors,
  recordAudit,
  sanitizeMetadata,
} from '@/server/services/audit';
import { createChapter } from '@/server/services/chapter-service';
import { createAcademicYear } from '@/server/services/academic-year';
import { createUser } from '@/server/services/user-admin';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDb();
});

describe('sanitizeMetadata', () => {
  it('strips forbidden keys recursively, including inside nested objects and arrays', () => {
    const result = sanitizeMetadata({
      title: 'ok',
      password: 'leak',
      nested: { token: 'leak', keep: 'ok' },
      list: [{ secret: 'leak', keep: 'ok' }, 'plain'],
    });
    expect(result).toEqual({
      title: 'ok',
      nested: { keep: 'ok' },
      list: [{ keep: 'ok' }, 'plain'],
    });
  });

  it('is idempotent, so re-applying it to already-sanitized data changes nothing', () => {
    const once = sanitizeMetadata({ password: 'x', keep: 'y' });
    const twice = sanitizeMetadata(once);
    expect(twice).toEqual(once);
  });

  it('passes through null/undefined as null', () => {
    expect(sanitizeMetadata(null)).toBeNull();
    expect(sanitizeMetadata(undefined)).toBeNull();
  });
});

describe('listAuditLogs / countAuditLogs', () => {
  let chapterId: string;
  let otherChapterId: string;
  let yearId: string;
  let entryOldId: string;
  let entryMidId: string;
  let entryNewId: string;

  beforeEach(async () => {
    const program = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
    if (!program) throw new Error('Core programs missing.');
    const year = await createAcademicYear({ label: '2026–2027', startDate: '2026-09-01', endDate: '2027-06-30', activate: true, actor });
    yearId = year.id;
    const chapter = await createChapter({ programId: program.id, code: 'UAA', name: 'Chapter A', actor });
    chapterId = chapter.id;
    const other = await createChapter({ programId: program.id, code: 'ROB', name: 'Chapter B', actor });
    otherChapterId = other.id;

    const mentor = await createUser({ username: 'audit.mentor', fullName: 'Hande Özcan', role: 'mentor', chapterId, academicYearId: yearId, actor });
    const head = await createUser({ username: 'audit.head', fullName: 'Ada Sarp Kırık', role: 'chapter_head', chapterId: otherChapterId, academicYearId: yearId, actor });

    const db = getDb();
    // The fixture setup above (createAcademicYear/createChapter/createUser) is
    // itself audited, exactly like real usage — clear that incidental noise
    // so every test below starts from a known, exact set of audit rows.
    await db.delete(auditLogs);

    const [oldest] = await db
      .insert(auditLogs)
      .values({
        actorUserId: mentor.userId,
        actorName: 'Hande Özcan',
        action: AUDIT_ACTIONS.groupMentorAssigned,
        targetType: 'group',
        targetLabel: 'Bio 2',
        chapterId,
        academicYearId: yearId,
        createdAt: new Date('2026-08-01T10:00:00Z'),
      })
      .returning();
    const [middle] = await db
      .insert(auditLogs)
      .values({
        actorUserId: head.userId,
        actorName: 'Ada Sarp Kırık',
        action: AUDIT_ACTIONS.userCreated,
        targetType: 'user',
        targetLabel: 'yeni.kullanici',
        chapterId: otherChapterId,
        academicYearId: yearId,
        createdAt: new Date('2026-08-05T10:00:00Z'),
      })
      .returning();
    const [newest] = await db
      .insert(auditLogs)
      .values({
        actorUserId: null,
        actorName: 'Sistem',
        action: AUDIT_ACTIONS.bootstrapExecutiveCreated,
        targetType: 'user',
        targetLabel: 'ilk-yonetici',
        createdAt: new Date('2026-08-08T10:00:00Z'),
      })
      .returning();

    entryOldId = oldest!.id;
    entryMidId = middle!.id;
    entryNewId = newest!.id;
  });

  it('orders newest first', async () => {
    const rows = await listAuditLogs();
    expect(rows.map((r) => r.id)).toEqual([entryNewId, entryMidId, entryOldId]);
  });

  it('filters by action', async () => {
    const rows = await listAuditLogs({ action: AUDIT_ACTIONS.userCreated });
    expect(rows.map((r) => r.id)).toEqual([entryMidId]);
  });

  it('filters by actor name — including a system entry with a null actorUserId', async () => {
    const rows = await listAuditLogs({ actorName: 'Sistem' });
    expect(rows.map((r) => r.id)).toEqual([entryNewId]);
    expect(rows[0]?.actorUserId).toBeNull();
  });

  it('filters by chapter, and resolves the chapter name/code through the join', async () => {
    const rows = await listAuditLogs({ chapterId });
    expect(rows.map((r) => r.id)).toEqual([entryOldId]);
    expect(rows[0]?.chapterCode).toBe('UAA');
    expect(rows[0]?.chapterName).toBe('Chapter A');
  });

  it('filters by academic year, and resolves the year label through the join', async () => {
    const rows = await listAuditLogs({ academicYearId: yearId });
    expect(rows.map((r) => r.id).sort()).toEqual([entryMidId, entryOldId].sort());
    expect(rows.every((r) => r.academicYearLabel === '2026–2027')).toBe(true);
  });

  it('date filtering: "from" is inclusive and "to" covers the entire selected day', async () => {
    const fromRows = await listAuditLogs({ from: new Date('2026-08-05T00:00:00Z') });
    expect(fromRows.map((r) => r.id).sort()).toEqual([entryMidId, entryNewId].sort());

    // "to" as an exclusive upper bound at the *start* of the day after 2026-08-05
    // must still include everything recorded during 2026-08-05 itself.
    const toRows = await listAuditLogs({ to: new Date('2026-08-06T00:00:00Z') });
    expect(toRows.map((r) => r.id).sort()).toEqual([entryOldId, entryMidId].sort());
  });

  it('paginates stably with limit/offset, and countAuditLogs reports the true total regardless of limit', async () => {
    const page1 = await listAuditLogs({ limit: 2, offset: 0 });
    const page2 = await listAuditLogs({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(1);
    expect([...page1.map((r) => r.id), ...page2.map((r) => r.id)]).toEqual([entryNewId, entryMidId, entryOldId]);
    expect(await countAuditLogs()).toBe(3);
  });

  it('caps limit at 200 even when a caller asks for more', async () => {
    const rows = await listAuditLogs({ limit: 10_000 });
    expect(rows.length).toBeLessThanOrEqual(200);
  });

  it('returns an empty array, never throws, when nothing matches', async () => {
    const rows = await listAuditLogs({ action: 'nonexistent.action' });
    expect(rows).toEqual([]);
    expect(await countAuditLogs({ action: 'nonexistent.action' })).toBe(0);
  });

  it('re-sanitizes nested secret metadata at read time, even for a row inserted directly (simulating a pre-existing historical row)', async () => {
    await getDb()
      .insert(auditLogs)
      .values({
        actorUserId: null,
        actorName: 'Legacy Row',
        action: 'legacy.unaudited_write',
        targetType: 'user',
        beforeData: { nested: { password: 'leak-me' } },
        afterData: { items: [{ token: 'leak-me-too' }] },
      });
    const rows = await listAuditLogs({ actorName: 'Legacy Row' });
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0]?.beforeData)).not.toContain('leak-me');
    expect(JSON.stringify(rows[0]?.afterData)).not.toContain('leak-me-too');
  });

  it('never crashes on a null target label or a null chapter/academic-year', async () => {
    const rows = await listAuditLogs({ actorName: 'Sistem' });
    expect(rows[0]?.targetLabel).toBe('ilk-yonetici');
    expect(rows[0]?.chapterId).toBeNull();
    expect(rows[0]?.chapterCode).toBeNull();
    expect(rows[0]?.academicYearLabel).toBeNull();
  });
});

describe('listDistinctAuditActors', () => {
  it('lists every distinct actor exactly once, including a system entry with a null actorUserId', async () => {
    await recordAudit({ actorUserId: null, actorName: 'A', action: AUDIT_ACTIONS.userCreated, targetType: 'user' });
    await recordAudit({ actorUserId: null, actorName: 'A', action: AUDIT_ACTIONS.userDeleted, targetType: 'user' });
    await recordAudit({ actorUserId: null, actorName: 'Sistem', action: AUDIT_ACTIONS.bootstrapExecutiveCreated, targetType: 'user' });

    const actors = await listDistinctAuditActors();
    expect(actors.map((a) => a.actorName).sort()).toEqual(['A', 'Sistem']);
  });
});

describe('recordAudit', () => {
  it('still strips a forbidden key at write time (the original, non-nested behavior)', async () => {
    await recordAudit({
      actorUserId: null,
      actorName: 'Test',
      action: AUDIT_ACTIONS.userCreated,
      targetType: 'user',
      after: { username: 'x', temporaryPassword: 'should-not-be-stored' },
    });
    const [row] = await listAuditLogs({ actorName: 'Test' });
    expect(row?.afterData).toEqual({ username: 'x' });
  });
});
