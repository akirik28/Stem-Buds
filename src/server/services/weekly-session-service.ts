import { and, eq, gte, lt } from 'drizzle-orm';
import { getDb, type Database } from '@/server/db';
import {
  academicYears,
  groups,
  programHolidays,
  programSettings,
  weeklySessions,
} from '@/server/db/schema';
import { notFound, validationError } from '@/server/errors';
import { zonedTimeToUtc } from '@/lib/timezone';
import { AUDIT_ACTIONS, recordAudit } from './audit';

export type WeeklySession = typeof weeklySessions.$inferSelect;

type MatchingWeek = {
  weekNumber: number;
  localDate: { year: number; month: number; day: number };
};

/** Every date in [startDate, endDate] that falls on `isoWeekday`, in order. */
function matchingWeekdayDates(
  startDate: string,
  endDate: string,
  isoWeekday: number,
): MatchingWeek[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  // getUTCDay(): 0=Sunday..6=Saturday; our isoWeekday is 1=Monday..7=Sunday.
  const startIsoWeekday = start.getUTCDay() === 0 ? 7 : start.getUTCDay();
  const daysUntilFirstMatch = (isoWeekday - startIsoWeekday + 7) % 7;

  const first = new Date(start);
  first.setUTCDate(first.getUTCDate() + daysUntilFirstMatch);

  const results: MatchingWeek[] = [];
  let cursor = first;
  let weekNumber = 1;
  while (cursor.getTime() <= end.getTime()) {
    results.push({
      weekNumber,
      localDate: {
        year: cursor.getUTCFullYear(),
        month: cursor.getUTCMonth() + 1,
        day: cursor.getUTCDate(),
      },
    });
    const next = new Date(cursor);
    next.setUTCDate(next.getUTCDate() + 7);
    cursor = next;
    weekNumber += 1;
  }
  return results;
}

function localDateKey(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

export type GenerateSessionsResult = {
  created: number;
  reason?: 'not_configured' | 'no_active_year';
};

/**
 * Generates this group's weekly sessions for its academic year, from the
 * program's configured weekly slot.
 *
 * Only future sessions are created (never sessions whose slot has already
 * passed) and only once each: the unique index on
 * (group, scheduled_start) plus `onConflictDoNothing` makes repeated calls a
 * safe no-op, so this can be re-run after every schedule change without
 * duplicating or altering anything already generated — including sessions
 * that already have attendance or a work log attached to them.
 *
 * A date that matches a declared program holiday is still created (so
 * "Hafta N" numbering stays continuous across the year) but with
 * `state: 'holiday'` instead of `'scheduled'`.
 */
export async function generateWeeklySessionsForGroup(groupId: string): Promise<GenerateSessionsResult> {
  const db = getDb();

  const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
  if (!group) throw notFound('Grup bulunamadı.');

  const [year] = await db
    .select()
    .from(academicYears)
    .where(eq(academicYears.id, group.academicYearId))
    .limit(1);
  if (!year) throw notFound('Akademik yıl bulunamadı.');

  const [settings] = await db
    .select()
    .from(programSettings)
    .where(eq(programSettings.programId, group.programId))
    .limit(1);

  if (
    !settings ||
    settings.weeklyDayOfWeek === null ||
    settings.weeklyStartMinute === null ||
    settings.weeklyDurationMinutes === null
  ) {
    return { created: 0, reason: 'not_configured' };
  }

  const holidays = await db
    .select({ holidayDate: programHolidays.holidayDate })
    .from(programHolidays)
    .where(
      and(
        eq(programHolidays.programId, group.programId),
        eq(programHolidays.academicYearId, group.academicYearId),
      ),
    );
  const holidayDates = new Set(holidays.map((h) => h.holidayDate));

  const weeks = matchingWeekdayDates(year.startDate, year.endDate, settings.weeklyDayOfWeek);

  const startHour = Math.floor(settings.weeklyStartMinute / 60);
  const startMinute = settings.weeklyStartMinute % 60;
  const now = new Date();

  let created = 0;
  for (const week of weeks) {
    const scheduledStartAt = zonedTimeToUtc(
      week.localDate.year,
      week.localDate.month,
      week.localDate.day,
      startHour,
      startMinute,
      settings.timezone,
    );
    if (scheduledStartAt.getTime() < now.getTime()) continue; // future only

    const scheduledEndAt = new Date(scheduledStartAt.getTime() + settings.weeklyDurationMinutes * 60_000);
    const isHoliday = holidayDates.has(localDateKey(week.localDate));

    const inserted = await db
      .insert(weeklySessions)
      .values({
        groupId: group.id,
        academicYearId: group.academicYearId,
        weekNumber: week.weekNumber,
        scheduledStartAt,
        scheduledEndAt,
        state: isHoliday ? 'holiday' : 'scheduled',
        cancellationReason: isHoliday ? 'Program geneli tatil' : null,
      })
      .onConflictDoNothing({ target: [weeklySessions.groupId, weeklySessions.scheduledStartAt] })
      .returning({ id: weeklySessions.id });

    if (inserted.length > 0) created += 1;
  }

  return { created };
}

/** Runs generation for every group in one program's given academic year. */
export async function generateWeeklySessionsForProgram(
  programId: string,
  academicYearId: string,
): Promise<{ groupsProcessed: number; sessionsCreated: number }> {
  const db = getDb();
  const groupRows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.programId, programId), eq(groups.academicYearId, academicYearId)));

  let sessionsCreated = 0;
  for (const row of groupRows) {
    const result = await generateWeeklySessionsForGroup(row.id);
    sessionsCreated += result.created;
  }
  return { groupsProcessed: groupRows.length, sessionsCreated };
}

export type DeclareHolidayInput = {
  programId: string;
  academicYearId: string;
  holidayDate: string;
  reason: string;
  actor: { id: string | null; name: string };
};

/**
 * "Bu hafta çalışma yok / tatil": records the holiday for the program/year
 * and retroactively marks any already-generated `scheduled` session for that
 * calendar date (across every group in the program) as `holiday` — future
 * generation runs will also see it and skip marking new ones as scheduled.
 */
export async function declareProgramHoliday(input: DeclareHolidayInput): Promise<{ sessionsUpdated: number }> {
  if (!input.reason.trim()) throw validationError('Tatil açıklaması zorunludur.');

  const db = getDb();
  const [settings] = await db
    .select({ timezone: programSettings.timezone })
    .from(programSettings)
    .where(eq(programSettings.programId, input.programId))
    .limit(1);
  const timezone = settings?.timezone ?? 'Europe/Istanbul';

  return db.transaction(async (tx: Database) => {
    await tx
      .insert(programHolidays)
      .values({
        programId: input.programId,
        academicYearId: input.academicYearId,
        holidayDate: input.holidayDate,
        reason: input.reason.trim(),
        createdById: input.actor.id,
      })
      .onConflictDoNothing({
        target: [programHolidays.programId, programHolidays.academicYearId, programHolidays.holidayDate],
      });

    const [y, m, d] = input.holidayDate.split('-').map(Number);
    const dayStart = zonedTimeToUtc(y!, m!, d!, 0, 0, timezone);

    // Advance the *calendar* date by one day using plain UTC-anchored
    // arithmetic on (y, m, d) — never on the zoned instant itself. Istanbul
    // midnight is 21:00 UTC the *previous* day, so incrementing the instant's
    // UTC calendar date lands back on the same local day instead of the next
    // one; that was the original bug here.
    const nextCalendarDay = new Date(Date.UTC(y!, m! - 1, d!));
    nextCalendarDay.setUTCDate(nextCalendarDay.getUTCDate() + 1);
    const dayEnd = zonedTimeToUtc(
      nextCalendarDay.getUTCFullYear(),
      nextCalendarDay.getUTCMonth() + 1,
      nextCalendarDay.getUTCDate(),
      0,
      0,
      timezone,
    );

    const affectedGroups = await tx
      .select({ id: groups.id })
      .from(groups)
      .where(and(eq(groups.programId, input.programId), eq(groups.academicYearId, input.academicYearId)));
    const groupIds = new Set(affectedGroups.map((g) => g.id));

    const candidates = await tx
      .select({ id: weeklySessions.id, groupId: weeklySessions.groupId })
      .from(weeklySessions)
      .where(
        and(
          eq(weeklySessions.academicYearId, input.academicYearId),
          gte(weeklySessions.scheduledStartAt, dayStart),
          lt(weeklySessions.scheduledStartAt, dayEnd),
          eq(weeklySessions.state, 'scheduled'),
        ),
      );

    let sessionsUpdated = 0;
    for (const session of candidates) {
      if (!groupIds.has(session.groupId)) continue;
      await tx
        .update(weeklySessions)
        .set({ state: 'holiday', cancellationReason: input.reason.trim(), updatedAt: new Date() })
        .where(eq(weeklySessions.id, session.id));
      sessionsUpdated += 1;
    }

    await recordAudit(
      {
        actorUserId: input.actor.id,
        actorName: input.actor.name,
        action: AUDIT_ACTIONS.programScheduleChanged,
        targetType: 'program_holiday',
        targetId: null,
        targetLabel: input.holidayDate,
        academicYearId: input.academicYearId,
        after: { holidayDate: input.holidayDate, reason: input.reason.trim() },
      },
      tx,
    );

    return { sessionsUpdated };
  });
}

export async function getWeeklySessionById(id: string): Promise<WeeklySession | null> {
  const [row] = await getDb().select().from(weeklySessions).where(eq(weeklySessions.id, id)).limit(1);
  return row ?? null;
}

export async function listWeeklySessionsByGroup(groupId: string): Promise<WeeklySession[]> {
  return getDb()
    .select()
    .from(weeklySessions)
    .where(eq(weeklySessions.groupId, groupId))
    .orderBy(weeklySessions.weekNumber);
}
