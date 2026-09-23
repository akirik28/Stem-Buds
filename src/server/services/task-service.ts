import { isMentor } from '@/server/authz/policy';
import type { AccessScope } from '@/server/authz/policy';
import { listAlertsForMentor, listAlertsForViewer, type ManagementAlert } from './alert-query';
import { daysAtLevel, listIssuesForViewer, type GroupIssue } from './issue-service';
import { listAbsencesForViewer, type AbsenceNotice } from './class-mode-service';

/**
 * "Yapılacaklar": the open alerts, restated as a short ordered list of things
 * to actually do.
 *
 * No new table and no new domain logic — an alert already *is* a problem
 * someone has to resolve. What was missing is that the feed described the
 * problem ("Katılım riski") rather than the move ("Katılımı düşen oturumu
 * aç ve nedenini yaz"), so a reader had to translate every card before they
 * could act. This does that translation once, in one place.
 *
 * Ordered by urgency, most urgent first, because the list is meant to be
 * worked from the top rather than read.
 */

export type Task = {
  id: string;
  /** A reported problem behaves differently from a detected one: it can be
      handed upward or closed, so the list needs to tell them apart. */
  kind: 'alert' | 'issue' | 'absence';
  /** What to do, in the imperative — never a restatement of the symptom. */
  title: string;
  /** The evidence behind it, straight from the alert. */
  detail: string;
  severity: 'red' | 'yellow' | 'info';
  /** Where the work happens; null when the alert has no single place. */
  href: string | null;
};

/** The move each kind of alert asks for. */
const ACTION_BY_CATEGORY: Record<string, string> = {
  missing_weekly_record: 'Eksik haftalık kaydı doldur',
  attendance_risk: 'Katılımı düşen grubu aç, nedenini not et',
  homework_risk: 'Ödev tamamlamayı grupla konuş',
  project_stale: 'Duran projeye bir sonraki adımı yaz',
  project_blocked: 'Projedeki engeli kaldır',
  milestone_overdue: 'Geciken milestone’u güncelle',
  chapter_meeting_overdue: 'Chapter toplantısını planla',
};

const SEVERITY_ORDER: Record<string, number> = { red: 0, yellow: 1, info: 2 };

function alertLink(alert: ManagementAlert): string | null {
  if (!alert.chapterId || !alert.groupId) return null;
  const base = `/panel/gruplar/${alert.chapterId}/${alert.groupId}`;
  if (alert.category === 'missing_weekly_record' || alert.category === 'attendance_risk') {
    const sessionId = (alert.metadata as { sessionId?: string })?.sessionId;
    return sessionId ? `${base}/oturumlar/${sessionId}` : base;
  }
  if (alert.category === 'project_stale' || alert.category === 'project_blocked' || alert.category === 'milestone_overdue') {
    return `${base}/proje`;
  }
  return base;
}

function toTask(alert: ManagementAlert): Task {
  return {
    id: alert.id,
    // Falling back to the alert's own title keeps a newly added category
    // from silently rendering an empty row.
    title: ACTION_BY_CATEGORY[alert.category] ?? alert.title,
    detail: alert.detail,
    severity: alert.severity,
    href: alertLink(alert),
    kind: 'alert',
  };
}

/**
 * A reported issue outranks a detected one at the same urgency: a person
 * went out of their way to write it, and it is sitting on this desk waiting
 * for an answer. The longer it has sat, the louder it gets.
 */
function issueToTask(issue: GroupIssue): Task {
  const days = daysAtLevel(issue);
  return {
    id: issue.id,
    kind: 'issue',
    title: 'Bildirilen sorun — sende',
    detail: issue.body,
    severity: days >= 5 ? 'red' : 'yellow',
    href: `/panel/gruplar/${issue.chapterId}/${issue.groupId}`,
  };
}

/**
 * Every role reads from the alert source it is already allowed to see — a
 * Mentor from their own groups, management from the feed. Authorization is
 * the underlying query's, never this function's.
 */
/**
 * Somebody saying in advance that they cannot come is the most time-critical
 * thing on the list: the session is today, and a group without its mentor
 * needs cover now rather than a note about it next week.
 */
function absenceToTask(notice: AbsenceNotice): Task {
  return {
    id: notice.id,
    kind: 'absence',
    title: notice.title,
    detail: notice.detail,
    severity: 'red',
    href: notice.href,
  };
}

export async function listTasksForViewer(scope: AccessScope): Promise<Task[]> {
  const [alerts, issues, absences] = await Promise.all([
    isMentor(scope.role) ? listAlertsForMentor(scope) : listAlertsForViewer(scope),
    listIssuesForViewer(scope),
    listAbsencesForViewer(scope),
  ]);

  const rank = (task: Task) => (task.kind === 'absence' ? 0 : task.kind === 'issue' ? 1 : 2);

  return [...absences.map(absenceToTask), ...issues.map(issueToTask), ...alerts.map(toTask)].sort(
    (a, b) => {
      const bySeverity = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
      if (bySeverity !== 0) return bySeverity;
      // A person waiting beats a threshold crossing; someone away beats both.
      return rank(a) - rank(b);
    },
  );
}
