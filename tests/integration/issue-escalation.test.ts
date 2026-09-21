import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { groupIssues } from '@/server/db/schema';
import { loadAccessScope } from '@/server/auth/context';
import { isAppError } from '@/server/errors';
import {
  DAYS_PER_LEVEL,
  escalateIssue,
  escalateStaleIssues,
  listIssuesForViewer,
  reportIssue,
  resolveIssue,
} from '@/server/services/issue-service';
import { createChapter } from '@/server/services/chapter-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { assignGroupMentor, createGroup } from '@/server/services/group-service';
import { getProgramByKey } from '@/server/services/program-service';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { closeTestDb, resetDatabase } from '../helpers/db';
import { futureAcademicYearWindow } from '../helpers/academic-year';

/**
 * The escalation chain. Two things move an issue, and the difference between
 * them is the whole point: a person can hand one all the way to the top, a
 * timer can only carry it as far as the Vice President.
 */

const actor = { id: null, name: 'test-suite' };

let academicYearId: string;
let chapterId: string;
let groupId: string;
let mentorId: string;
let headId: string;
let vpId: string;
let directorId: string;
let otherMentorId: string;
let otherGroupId: string;

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core program missing.');

  const year = await createAcademicYear({ ...futureAcademicYearWindow(), activate: true, actor });
  academicYearId = year.id;
  chapterId = (await createChapter({ programId: online.id, code: 'UAA', name: 'Chapter A', actor })).id;

  const mk = async (username: string, role: Parameters<typeof createUser>[0]['role'], chapter?: string) =>
    (await createUser({ username, fullName: username, role, chapterId: chapter ?? null, academicYearId: chapter ? academicYearId : null, actor })).userId;

  mentorId = await mk('mentor.a', 'mentor', chapterId);
  otherMentorId = await mk('mentor.b', 'mentor', chapterId);
  headId = await mk('head.a', 'chapter_head', chapterId);
  vpId = await mk('vp.a', 'vice_president');
  directorId = await mk('dir.a', 'regional_director');

  groupId = (await createGroup({ chapterId, academicYearId, disciplineKey: 'bio', actor })).id;
  otherGroupId = (await createGroup({ chapterId, academicYearId, disciplineKey: 'cs', actor })).id;
  await assignGroupMentor({ groupId, mentorUserId: mentorId, actor });
  await assignGroupMentor({ groupId: otherGroupId, mentorUserId: otherMentorId, actor });
});

afterAll(async () => {
  await closeTestDb();
});

const scopeOf = (userId: string, role: Parameters<typeof loadAccessScope>[1]) =>
  loadAccessScope(userId, role, academicYearId);

async function report(body = 'Grupta iki haftadır kimse gelmiyor, sebebini çözemedim.') {
  const scope = await scopeOf(mentorId, 'mentor');
  return reportIssue(scope, { groupId, body }, actor);
}

/** Backdates the level clock so the nightly sweep sees the issue as stale. */
async function ageIssue(issueId: string, days: number) {
  await getDb()
    .update(groupIssues)
    .set({ levelSince: new Date(Date.now() - days * 24 * 60 * 60 * 1000) })
    .where(eq(groupIssues.id, issueId));
}

describe('reporting', () => {
  it('starts every issue with the mentor, whoever reported it', async () => {
    const byDirector = await reportIssue(
      await scopeOf(directorId, 'regional_director'),
      { groupId, body: 'Bu grupta bir sorun olduğunu duydum, bakılsın.' },
      actor,
    );
    expect(byDirector.level).toBe('mentor');
  });

  it('refuses a description too short to act on', async () => {
    const scope = await scopeOf(mentorId, 'mentor');
    await expect(reportIssue(scope, { groupId, body: 'kötü' }, actor)).rejects.toSatisfy(isAppError);
  });
});

describe('who sees an issue', () => {
  it('sits with exactly one level at a time', async () => {
    await report();

    expect(await listIssuesForViewer(await scopeOf(mentorId, 'mentor'))).toHaveLength(1);
    expect(await listIssuesForViewer(await scopeOf(headId, 'chapter_head'))).toHaveLength(0);
    expect(await listIssuesForViewer(await scopeOf(vpId, 'vice_president'))).toHaveLength(0);
    expect(await listIssuesForViewer(await scopeOf(directorId, 'regional_director'))).toHaveLength(0);
  });

  it('never shows a mentor an issue from a group that is not theirs', async () => {
    await report();
    const other = await listIssuesForViewer(await scopeOf(otherMentorId, 'mentor'));
    expect(other).toHaveLength(0);
  });
});

describe('handing an issue up', () => {
  it('moves one level at a time, mentor → head → vice president → director', async () => {
    const issue = await report();

    await escalateIssue(await scopeOf(mentorId, 'mentor'), issue.id, actor);
    expect(await listIssuesForViewer(await scopeOf(headId, 'chapter_head'))).toHaveLength(1);

    await escalateIssue(await scopeOf(headId, 'chapter_head'), issue.id, actor);
    expect(await listIssuesForViewer(await scopeOf(vpId, 'vice_president'))).toHaveLength(1);

    await escalateIssue(await scopeOf(vpId, 'vice_president'), issue.id, actor);
    expect(await listIssuesForViewer(await scopeOf(directorId, 'regional_director'))).toHaveLength(1);
  });

  it('refuses anyone who is not currently holding it', async () => {
    const issue = await report();
    // The Chapter Head cannot pull it up early, and the Director cannot
    // push their own work back down.
    await expect(
      escalateIssue(await scopeOf(headId, 'chapter_head'), issue.id, actor),
    ).rejects.toSatisfy(isAppError);
    await expect(
      escalateIssue(await scopeOf(directorId, 'regional_director'), issue.id, actor),
    ).rejects.toSatisfy(isAppError);
  });

  it('cannot go past the director', async () => {
    const issue = await report();
    for (const [id, role] of [
      [mentorId, 'mentor'],
      [headId, 'chapter_head'],
      [vpId, 'vice_president'],
    ] as const) {
      await escalateIssue(await scopeOf(id, role), issue.id, actor);
    }
    await expect(
      escalateIssue(await scopeOf(directorId, 'regional_director'), issue.id, actor),
    ).rejects.toSatisfy(isAppError);
  });
});

describe('the timer', () => {
  it('leaves a fresh issue where it is', async () => {
    const issue = await report();
    const { escalated } = await escalateStaleIssues();
    expect(escalated).toBe(0);
    const [row] = await getDb().select().from(groupIssues).where(eq(groupIssues.id, issue.id));
    expect(row?.level).toBe('mentor');
  });

  it('moves an issue up once it has sat for the full period', async () => {
    const issue = await report();
    await ageIssue(issue.id, DAYS_PER_LEVEL + 1);

    const { escalated } = await escalateStaleIssues();
    expect(escalated).toBe(1);
    const [row] = await getDb().select().from(groupIssues).where(eq(groupIssues.id, issue.id));
    expect(row?.level).toBe('chapter_head');
  });

  it('resets the clock, so one sweep never skips two levels', async () => {
    const issue = await report();
    await ageIssue(issue.id, DAYS_PER_LEVEL + 1);

    await escalateStaleIssues();
    const second = await escalateStaleIssues();
    expect(second.escalated).toBe(0);

    const [row] = await getDb().select().from(groupIssues).where(eq(groupIssues.id, issue.id));
    expect(row?.level).toBe('chapter_head');
  });

  it('stops at the vice president — a timer never delivers to the director', async () => {
    const issue = await report();

    // Age it past the threshold again and again; it can only climb so far.
    for (let i = 0; i < 6; i += 1) {
      await ageIssue(issue.id, DAYS_PER_LEVEL + 1);
      await escalateStaleIssues();
    }

    const [row] = await getDb().select().from(groupIssues).where(eq(groupIssues.id, issue.id));
    expect(row?.level).toBe('vice_president');
    expect(await listIssuesForViewer(await scopeOf(directorId, 'regional_director'))).toHaveLength(0);
  });

  it('leaves a resolved issue alone however long it sits', async () => {
    const issue = await report();
    await resolveIssue(await scopeOf(mentorId, 'mentor'), issue.id, 'Aileyle konuşuldu.', actor);
    await ageIssue(issue.id, DAYS_PER_LEVEL * 5);

    const { escalated } = await escalateStaleIssues();
    expect(escalated).toBe(0);
  });
});

describe('closing', () => {
  it('takes the issue off every list', async () => {
    const issue = await report();
    await resolveIssue(await scopeOf(mentorId, 'mentor'), issue.id, 'Çözüldü.', actor);

    expect(await listIssuesForViewer(await scopeOf(mentorId, 'mentor'))).toHaveLength(0);
    const [row] = await getDb().select().from(groupIssues).where(eq(groupIssues.id, issue.id));
    expect(row?.status).toBe('resolved');
    expect(row?.resolutionNote).toBe('Çözüldü.');
  });

  it('refuses someone who is not holding it, and refuses a second close', async () => {
    const issue = await report();
    await expect(
      resolveIssue(await scopeOf(headId, 'chapter_head'), issue.id, 'oldu', actor),
    ).rejects.toSatisfy(isAppError);

    await resolveIssue(await scopeOf(mentorId, 'mentor'), issue.id, 'oldu', actor);
    await expect(
      resolveIssue(await scopeOf(mentorId, 'mentor'), issue.id, 'tekrar', actor),
    ).rejects.toSatisfy(isAppError);
  });
});
