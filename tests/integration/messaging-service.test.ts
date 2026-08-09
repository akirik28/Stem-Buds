import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadAccessScope } from '@/server/auth/context';
import {
  deleteMessage,
  getChannelForViewer,
  listChannelMessages,
  listChannelsForViewer,
  postMessage,
  setMessagePinned,
} from '@/server/services/messaging-service';
import { createChapter } from '@/server/services/chapter-service';
import { addGroupMember, assignGroupMentor, createGroup } from '@/server/services/group-service';
import { createUser } from '@/server/services/user-admin';
import { createAcademicYear } from '@/server/services/academic-year';
import { getProgramByKey } from '@/server/services/program-service';
import { getDb } from '@/server/db';
import { channels } from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { PROGRAM_KEYS } from '@/server/domain/program';
import { isAppError } from '@/server/errors';
import { closeTestDb, resetDatabase } from '../helpers/db';

const actor = { id: null, name: 'test-suite' };

let onlineProgramId: string;
let academicYearId: string;
let chapterAId: string;
let chapterBId: string;
let groupAId: string;
let mentorAId: string;
let studentAId: string;
let headAId: string;
let directorId: string;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  const online = await getProgramByKey(PROGRAM_KEYS.onlineMiddleSchool);
  if (!online) throw new Error('Core programs missing.');
  onlineProgramId = online.id;

  const year = await createAcademicYear({ label: '2026–2027', startDate: '2026-09-01', endDate: '2027-06-30', activate: true, actor });
  academicYearId = year.id;

  const chapterA = await createChapter({ programId: onlineProgramId, code: 'UAA', name: 'Chapter A', actor });
  const chapterB = await createChapter({ programId: onlineProgramId, code: 'ROB', name: 'Chapter B', actor });
  chapterAId = chapterA.id;
  chapterBId = chapterB.id;
  const groupA = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'bio', actor });
  groupAId = groupA.id;

  const mentorA = await createUser({ username: 'mentor.a', fullName: 'Mentor A', role: 'mentor', chapterId: chapterAId, academicYearId, actor });
  mentorAId = mentorA.userId;
  await assignGroupMentor({ groupId: groupAId, mentorUserId: mentorAId, actor });

  const head = await createUser({ username: 'head.a', fullName: 'Head A', role: 'chapter_head', chapterId: chapterAId, academicYearId, actor });
  headAId = head.userId;

  const studentA = await createUser({ username: 'student.a', fullName: 'Student A', role: 'student', chapterId: chapterAId, academicYearId, actor });
  studentAId = studentA.userId;
  await addGroupMember({ groupId: groupAId, userId: studentAId, role: 'student', actor });

  const director = await createUser({ username: 'director.test', fullName: 'Director', role: 'regional_director', actor });
  directorId = director.userId;

  // Provisioning happens lazily inside `listChannelsForViewer`; run it once
  // up front so every test can look channels up directly by id/type.
  const execScope = await loadAccessScope(directorId, 'regional_director', academicYearId);
  await listChannelsForViewer(execScope);
});

afterAll(async () => {
  await closeTestDb();
});

async function findGroupChannelId(): Promise<string> {
  const [row] = await getDb().select().from(channels).where(eq(channels.groupId, groupAId)).limit(1);
  if (!row) throw new Error('Group channel not provisioned.');
  return row.id;
}

describe('channel access — Advisor Teacher hard block', () => {
  it('never lets an Advisor Teacher — even organization-wide — access any channel', async () => {
    const advisor = await createUser({ username: 'advisor.test', fullName: 'Advisor', role: 'advisor_teacher', programIds: [onlineProgramId], actor });
    const advisorScope = await loadAccessScope(advisor.userId, 'advisor_teacher', academicYearId);
    expect(await listChannelsForViewer(advisorScope)).toHaveLength(0);

    const execScope = await loadAccessScope(directorId, 'regional_director', academicYearId);
    await listChannelsForViewer(execScope); // provisions channels
    const groupChannelId = await findGroupChannelId();
    expect(await getChannelForViewer(advisorScope, groupChannelId)).toBeNull();
  });
});

describe('channel access — role scoping', () => {
  it('gives a Student only their own Group channel, never chapter/presidency channels', async () => {
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const list = await listChannelsForViewer(studentScope);
    expect(list).toHaveLength(1);
    expect(list[0]?.type).toBe('group');
    expect(list[0]?.groupId).toBe(groupAId);
  });

  it('gives a Mentor their own chapter’s mentor channel plus their own Group channel, not chapter B’s', async () => {
    const groupB = await createGroup({ chapterId: chapterBId, academicYearId, disciplineKey: 'cs', actor });
    const mentorB = await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: chapterBId, academicYearId, actor });
    await assignGroupMentor({ groupId: groupB.id, mentorUserId: mentorB.userId, actor });

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const list = await listChannelsForViewer(mentorScope);
    const types = list.map((c) => c.type).sort();
    expect(types).toEqual(['chapter_mentors', 'group']);
    expect(list.every((c) => c.chapterId === chapterAId || c.groupId === groupAId)).toBe(true);
  });

  it('gives Executive Management every channel including presidency and chapter management', async () => {
    const execScope = await loadAccessScope(directorId, 'regional_director', academicYearId);
    const list = await listChannelsForViewer(execScope);
    const types = list.map((c) => c.type);
    expect(types).toContain('presidency');
    expect(types).toContain('chapter_management');
    expect(types).toContain('chapter_mentors');
    expect(types).toContain('group');
  });

  it('gives a Chapter Head chapter management, their own mentor channel, and their own Groups’ channels', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const list = await listChannelsForViewer(headScope);
    const types = list.map((c) => c.type).sort();
    expect(types).toEqual(['chapter_management', 'chapter_mentors', 'group']);
  });

  it('gives two Groups in the same Chapter two distinct Group channels, not one shared one', async () => {
    const groupA2 = await createGroup({ chapterId: chapterAId, academicYearId, disciplineKey: 'cs', actor });
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const list = await listChannelsForViewer(headScope);
    const groupChannels = list.filter((c) => c.type === 'group');
    expect(groupChannels.map((c) => c.groupId).sort()).toEqual([groupAId, groupA2.id].sort());
  });

  it('provisioning channels twice never creates duplicates', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await listChannelsForViewer(headScope);
    const countAfterFirst = (await getDb().select().from(channels)).length;
    await listChannelsForViewer(headScope);
    const countAfterSecond = (await getDb().select().from(channels)).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });
});

describe('postMessage', () => {
  it('rejects a Mentor posting in another chapter’s mentor channel, even with the real ID', async () => {
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await listChannelsForViewer(headScope);
    const chapterBHead = await createUser({ username: 'head.b', fullName: 'Head B', role: 'chapter_head', chapterId: chapterBId, academicYearId, actor });
    const headBScope = await loadAccessScope(chapterBHead.userId, 'chapter_head', academicYearId);
    await listChannelsForViewer(headBScope);
    const [chapterBMentorChannel] = await getDb().select().from(channels).where(eq(channels.chapterId, chapterBId)).limit(1);
    if (!chapterBMentorChannel) throw new Error('missing channel');

    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      postMessage({ scope: mentorScope, channelId: chapterBMentorChannel.id, body: 'merhaba', actor: { id: mentorAId, name: 'Mentor A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('rejects a Mentor marking a message as an announcement', async () => {
    const groupChannelId = await findGroupChannelId();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await expect(
      postMessage({ scope: mentorScope, channelId: groupChannelId, body: 'x', isAnnouncement: true, actor: { id: mentorAId, name: 'Mentor A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets a Chapter Head post an announcement', async () => {
    const groupChannelId = await findGroupChannelId();
    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    const message = await postMessage({ scope: headScope, channelId: groupChannelId, body: 'Önemli duyuru', isAnnouncement: true, actor: { id: headAId, name: 'Head A' } });
    expect(message.isAnnouncement).toBe(true);
  });

  it('only records a mention for someone who could actually access the channel', async () => {
    const groupB = await createGroup({ chapterId: chapterBId, academicYearId, disciplineKey: 'cs', actor });
    const mentorB = await createUser({ username: 'mentor.b', fullName: 'Mentor B', role: 'mentor', chapterId: chapterBId, academicYearId, actor });
    await assignGroupMentor({ groupId: groupB.id, mentorUserId: mentorB.userId, actor });

    const groupChannelId = await findGroupChannelId();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    await postMessage({
      scope: mentorScope,
      channelId: groupChannelId,
      body: '@student.a merhaba, @director.test da bir not, @mentor.b bu grubu göremez',
      actor: { id: mentorAId, name: 'Mentor A' },
    });

    const { messageMentions } = await import('@/server/db/schema');
    const mentions = await getDb().select().from(messageMentions);
    // student.a is a real member of the group channel, director.test is
    // Executive (always has oversight access) -> both mentioned. mentor.b
    // has no access to chapter A's Group channel -> silently not mentioned.
    expect(mentions.map((m) => m.userId).sort()).toEqual([studentAId, directorId].sort());
  });
});

describe('message moderation', () => {
  it('lets the author delete their own message', async () => {
    const groupChannelId = await findGroupChannelId();
    const studentScope = await loadAccessScope(studentAId, 'student', academicYearId);
    const message = await postMessage({ scope: studentScope, channelId: groupChannelId, body: 'merhaba', actor: { id: studentAId, name: 'Student A' } });

    await deleteMessage({ scope: studentScope, messageId: message.id, actor: { id: studentAId, name: 'Student A' } });
    const remaining = await listChannelMessages(studentScope, groupChannelId);
    expect(remaining).toHaveLength(0);
  });

  it('rejects a non-author, non-moderator Student deleting someone else’s message', async () => {
    const groupChannelId = await findGroupChannelId();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const message = await postMessage({ scope: mentorScope, channelId: groupChannelId, body: 'merhaba', actor: { id: mentorAId, name: 'Mentor A' } });

    const studentB = await createUser({ username: 'student.b', fullName: 'Student B', role: 'student', chapterId: chapterAId, academicYearId, actor });
    await addGroupMember({ groupId: groupAId, userId: studentB.userId, role: 'student', actor });
    const studentBScope = await loadAccessScope(studentB.userId, 'student', academicYearId);

    await expect(
      deleteMessage({ scope: studentBScope, messageId: message.id, actor: { id: studentB.userId, name: 'Student B' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets the Chapter Head moderate-delete a message in their own chapter’s Group channel', async () => {
    const groupChannelId = await findGroupChannelId();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const message = await postMessage({ scope: mentorScope, channelId: groupChannelId, body: 'merhaba', actor: { id: mentorAId, name: 'Mentor A' } });

    const headScope = await loadAccessScope(headAId, 'chapter_head', academicYearId);
    await deleteMessage({ scope: headScope, messageId: message.id, actor: { id: headAId, name: 'Head A' } });
    const remaining = await listChannelMessages(mentorScope, groupChannelId);
    expect(remaining).toHaveLength(0);
  });

  it('rejects a plain Mentor pinning a message (not a moderator)', async () => {
    const groupChannelId = await findGroupChannelId();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const message = await postMessage({ scope: mentorScope, channelId: groupChannelId, body: 'merhaba', actor: { id: mentorAId, name: 'Mentor A' } });

    await expect(
      setMessagePinned({ scope: mentorScope, messageId: message.id, pinned: true, actor: { id: mentorAId, name: 'Mentor A' } }),
    ).rejects.toSatisfy((error: unknown) => isAppError(error) && error.code === 'validation');
  });

  it('lets Executive Management pin a message anywhere', async () => {
    const groupChannelId = await findGroupChannelId();
    const mentorScope = await loadAccessScope(mentorAId, 'mentor', academicYearId);
    const message = await postMessage({ scope: mentorScope, channelId: groupChannelId, body: 'merhaba', actor: { id: mentorAId, name: 'Mentor A' } });

    const execScope = await loadAccessScope(directorId, 'regional_director', academicYearId);
    const pinned = await setMessagePinned({ scope: execScope, messageId: message.id, pinned: true, actor: { id: directorId, name: 'Director' } });
    expect(pinned.isPinned).toBe(true);
  });
});

describe('channel provisioning at scale — regression for the production fan-out bug', () => {
  it('provisions and lists channels for many chapters/groups with a bounded, constant number of queries, not one per chapter or group', async () => {
    // The default fixtures already have 2 chapters and 1 group. Add a lot
    // more so a per-row implementation would issue a proportionally large
    // number of round trips — exactly what made the Executive `/panel`
    // dashboard fail against Supabase's single production connection
    // (`max: 1`), even though the same code was harmless against a local
    // Postgres connection with no meaningful per-query latency.
    const extraChapterCount = 12;
    const extraChapters = await Promise.all(
      Array.from({ length: extraChapterCount }, (_, i) =>
        createChapter({ programId: onlineProgramId, code: `EX${i}`, name: `Extra Chapter ${i}`, actor }),
      ),
    );
    const extraGroups = await Promise.all(
      extraChapters.map((chapter) => createGroup({ chapterId: chapter.id, academicYearId, disciplineKey: 'cs', actor })),
    );

    const totalChapters = 2 + extraChapterCount; // fixtures' Chapter A/B + the new ones
    const totalGroups = 1 + extraGroups.length; // fixtures' groupA + the new ones
    const totalOrgChannels = 2; // presidency, chapter_management

    const db = getDb();
    const selectSpy = vi.spyOn(db, 'select');
    const insertSpy = vi.spyOn(db, 'insert');

    const execScope = await loadAccessScope(directorId, 'regional_director', academicYearId);
    const result = await listChannelsForViewer(execScope);

    // Correctness first: every chapter/group really did get its channel —
    // a fast implementation that silently provisioned fewer rows would be
    // a worse bug than the slow one it replaced.
    expect(result).toHaveLength(totalChapters + totalGroups + totalOrgChannels);

    // The old implementation issued one INSERT per chapter, one per group,
    // and (in the listing loop below it) two more SELECTs per accessible
    // channel — i.e. query counts that grow with N. The fixed
    // implementation batches every step into a handful of statements
    // regardless of how many chapters/groups/channels exist.
    expect(selectSpy.mock.calls.length).toBeLessThan(10);
    expect(insertSpy.mock.calls.length).toBeLessThan(10);

    selectSpy.mockRestore();
    insertSpy.mockRestore();
  });

  it('returns a normal empty list — never throws — when there are no chapters, groups, or channels at all', async () => {
    // A fresh org with only the Executive account and no chapters/groups/
    // messages yet — the state right after `bootstrap-deploy.ts` creates
    // the first Executive on a brand-new production database.
    await resetDatabase();
    const freshDirector = await createUser({ username: 'fresh.director', fullName: 'Fresh Director', role: 'regional_director', actor });
    const execScope = await loadAccessScope(freshDirector.userId, 'regional_director', null);

    const result = await listChannelsForViewer(execScope);

    // Only the two org-wide singleton channels can exist yet; no chapters
    // or groups means no chapter_mentors/group channels, and definitely no
    // messages, so every unread count and lastMessageAt is a safe default.
    expect(result.length).toBe(2);
    expect(result.every((c) => c.unreadCount === 0 && c.lastMessageAt === null)).toBe(true);
  });
});
