import { assertPermission } from '@/server/auth/context';
import {
  isAdvisorTeacher,
  isChapterHead,
  isExecutive,
  isMentor,
  type AccessScope,
} from '@/server/authz/policy';
import { validationError } from '@/server/errors';
import { getChapterById } from './chapter-service';
import { getGroupById } from './group-service';
import { getGroupSignals, type GroupSignals } from './group-signals';
import { listAlertsForMentor, listAlertsForViewer, getManagementKpis, type ManagementKpis } from './alert-query';
import { getOrGenerateInsight, type InsightOutcome } from '@/server/ai/insight-cache';
import { isoWeekKey } from '@/server/domain/iso-week';
import type { AiProvider } from '@/server/ai/provider';

/**
 * Every bounded Phase 5 AI surface, one function each, matching Sections
 * 5.1 and 6 of the spec exactly. Each function asserts the caller's
 * authorization for the *exact* requested scope first — before building any
 * facts, before any cache lookup — so a cache hit can never be returned to
 * an unauthorized or differently-scoped caller.
 */

export type NoAlertsOutcome = { status: 'no_alerts' };
export type MentorInsightOutcome = InsightOutcome | NoAlertsOutcome;

type Actor = { id: string | null; name: string };

/**
 * Rates reach the model as a labelled percentage rather than a bare 0–1
 * float. `attendanceRate: 0.83` reads as either "83% attended" or "83% were
 * absent" depending only on how the name is skimmed, and a small model gets
 * it backwards — qwen3:4b inverted exactly this field in three runs out of
 * three, reporting a healthy 83% turnout as 83% absence. Spelling out both
 * the unit and the direction costs a few tokens and removes the ambiguity
 * for every provider.
 *
 * `null` is passed through as an explicit "no data" rather than dropped, so
 * a missing rate cannot be mistaken for a zero.
 */
function labelRate(value: number | null, meaning: string) {
  return value === null
    ? { percent: null, means: `${meaning} — bu dönem için veri yok` }
    : { percent: Math.round(value * 100), means: meaning };
}

function describeKpis(kpis: ManagementKpis) {
  return {
    activeChapters: kpis.activeChapters,
    activeGroups: kpis.activeGroups,
    attendance: labelRate(kpis.attendanceRate, 'derse katılan öğrenci yüzdesi (yüksek = iyi)'),
    homeworkCompletion: labelRate(kpis.homeworkCompletionRate, 'ödevini tamamlayan öğrenci yüzdesi (yüksek = iyi)'),
    weeklyRecordCompletion: labelRate(
      kpis.weeklyRecordCompletionRate,
      'mentörün haftalık kaydı doldurma yüzdesi (yüksek = iyi)',
    ),
    projectsNeedingAttention: kpis.projectsNeedingAttention,
    openAlerts: kpis.openAlertCount,
  };
}

function describeGroupSignals(signals: GroupSignals) {
  const { attendanceRate, homeworkRate, daysSinceProjectProgress, ...rest } = signals;
  return {
    ...rest,
    attendance: labelRate(attendanceRate, 'derse katılan öğrenci yüzdesi (yüksek = iyi)'),
    homework: labelRate(homeworkRate, 'ödevini tamamlayan öğrenci yüzdesi (yüksek = iyi)'),
    daysSinceProjectProgress:
      daysSinceProjectProgress === null
        ? { days: null, means: 'projede hiç ilerleme kaydı yok' }
        : { days: daysSinceProjectProgress, means: 'son proje ilerlemesinden bu yana geçen gün (yüksek = kötü)' },
  };
}

// ---------------------------------------------------------------------------
// 6.1 "Haftalık Özet" — REGIONAL_DIRECTOR + VICE_DIRECTOR
// ---------------------------------------------------------------------------

export async function getWeeklySummaryInsight(
  scope: AccessScope,
  programId: string | null,
  actor: Actor,
  options: { forceRegenerate?: boolean; provider?: AiProvider } = {},
): Promise<InsightOutcome> {
  assertPermission(isExecutive(scope.role));

  const kpis = await getManagementKpis(scope, { programId: programId ?? undefined });
  const alerts = await listAlertsForViewer(scope, { programId: programId ?? undefined });
  const alertCounts = countByCategory(alerts.map((a) => a.category));
  const period = isoWeekKey(new Date());

  const facts = {
    period,
    program: programId ?? 'ALL',
    kpis: describeKpis(kpis),
    activeAlertCounts: alertCounts,
    topAttentionGroups: alerts.slice(0, 10).map((a) => ({ category: a.category, severity: a.severity, title: a.title })),
  };

  return getOrGenerateInsight({
    insightType: 'weekly_summary',
    scopeType: 'organization',
    scopeId: null,
    programId,
    periodKey: period,
    facts,
    instruction:
      'Bu haftanın operasyonel özetini üret: bu hafta önemli olarak değişen neler var, aktif uyarı sayı/tipleri, dikkat gerektiren gruplar/projeler ve en fazla 3-5 önerilen aksiyon.',
    actor,
    forceRegenerate: options.forceRegenerate,
    provider: options.provider,
  });
}

// ---------------------------------------------------------------------------
// 6.2 "Grup Durumları" — CHAPTER_HEAD only
// ---------------------------------------------------------------------------

export async function getChapterGroupStatusInsight(
  scope: AccessScope,
  chapterId: string,
  actor: Actor,
  options: { forceRegenerate?: boolean; provider?: AiProvider } = {},
): Promise<InsightOutcome> {
  assertPermission(isChapterHead(scope.role) && scope.headChapterIds.includes(chapterId));

  const chapter = await getChapterById(chapterId);
  if (!chapter) throw validationError('Chapter bulunamadı.');

  const { listGroupsByChapter } = await import('./group-service');
  const { getActiveAcademicYear } = await import('./academic-year');
  const activeYear = await getActiveAcademicYear();
  if (!activeYear) throw validationError('Aktif akademik yıl bulunamadı.');

  const chapterGroups = await listGroupsByChapter(chapterId, activeYear.id);
  const groupSignals = await Promise.all(chapterGroups.map((g) => getGroupSignals(g.id, activeYear.id)));

  const period = isoWeekKey(new Date());
  const facts = { period, chapterRef: chapter.name, groups: groupSignals.map(describeGroupSignals) };

  return getOrGenerateInsight({
    insightType: 'chapter_group_status',
    scopeType: 'chapter',
    scopeId: chapterId,
    programId: chapter.programId,
    periodKey: period,
    facts,
    instruction:
      'Bu Chapter içindeki grupların güncel durumunu özetle: hangi gruplar yolunda, hangilerinde uyarı var, eksik haftalık kayıt/katılım/ödev sinyalleri, durağan veya bloke projeler ve önerilen takip adımları.',
    actor,
    forceRegenerate: options.forceRegenerate,
    provider: options.provider,
  });
}

// ---------------------------------------------------------------------------
// 6.3 "Verilere Sor" — REGIONAL_DIRECTOR + VICE_DIRECTOR only
// ---------------------------------------------------------------------------

const MAX_QUESTION_LENGTH = 300;

export async function getDataQuestionInsight(
  scope: AccessScope,
  question: string,
  programId: string | null,
  actor: Actor,
  options: { provider?: AiProvider } = {},
): Promise<InsightOutcome> {
  assertPermission(isExecutive(scope.role));

  const trimmed = question.trim();
  if (trimmed.length === 0) throw validationError('Soru boş olamaz.');
  if (trimmed.length > MAX_QUESTION_LENGTH) throw validationError('Soru çok uzun.');

  const kpis = await getManagementKpis(scope, { programId: programId ?? undefined });
  const alerts = await listAlertsForViewer(scope, { programId: programId ?? undefined });
  const facts = {
    // The question is clearly labeled as user-authored DATA, not an
    // instruction — see AI_SYSTEM_PROMPT / buildUserPrompt.
    question: trimmed,
    program: programId ?? 'ALL',
    kpis: describeKpis(kpis),
    activeAlerts: alerts.slice(0, 30).map((a) => ({
      category: a.category,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      chapterId: a.chapterId,
      groupId: a.groupId,
    })),
  };

  // Not cached by period — the question text itself is part of the context
  // hash, so an identical repeated question against unchanged data reuses
  // the cache automatically; a different question always regenerates.
  return getOrGenerateInsight({
    insightType: 'data_question',
    scopeType: 'organization',
    scopeId: null,
    programId,
    periodKey: null,
    facts,
    instruction:
      'Yalnızca sağlanan yetkili verilere dayanarak yönetim sorusunu yanıtla. Veriler yanıt için yetersizse bunu açıkça belirt; asla veri dışı bir cevap uydurma.',
    actor,
    provider: options.provider,
  });
}

// ---------------------------------------------------------------------------
// 6.4 "Dikkat Gerektirenler" — MENTOR only, assigned Groups' alerts only
// ---------------------------------------------------------------------------

export async function getMentorAlertExplainerInsight(
  scope: AccessScope,
  actor: Actor,
  options: { forceRegenerate?: boolean; provider?: AiProvider } = {},
): Promise<MentorInsightOutcome> {
  assertPermission(isMentor(scope.role));

  const alerts = await listAlertsForMentor(scope);
  if (alerts.length === 0) {
    // Never call Groq merely to manufacture commentary over nothing.
    return { status: 'no_alerts' };
  }

  const facts = {
    activeAlerts: alerts.map((a) => ({
      category: a.category,
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      groupId: a.groupId,
    })),
  };

  return getOrGenerateInsight({
    insightType: 'mentor_alert_explainer',
    scopeType: 'mentor',
    scopeId: scope.userId,
    programId: null,
    periodKey: isoWeekKey(new Date()),
    facts,
    instruction:
      'Mevcut uyarılardan hangilerinin önemli olduğunu, arkasındaki kayıtlı gerçeği ve mentörün hangi grup/kayda bakması gerektiğini kısaca açıkla. Yeni bir sorun keşfetme veya uydurma; yalnızca verilen uyarıları açıkla.',
    actor,
    forceRegenerate: options.forceRegenerate,
    provider: options.provider,
  });
}

// ---------------------------------------------------------------------------
// 6.5 "Grup Özetleri" — ADVISOR_TEACHER only, one authorized Group at a time
// ---------------------------------------------------------------------------

export async function getAdvisorGroupSummaryInsight(
  scope: AccessScope,
  groupId: string,
  actor: Actor,
  options: { forceRegenerate?: boolean; provider?: AiProvider } = {},
): Promise<InsightOutcome> {
  assertPermission(isAdvisorTeacher(scope.role));

  const group = await getGroupById(groupId);
  if (!group) throw validationError('Grup bulunamadı.');
  if (!scope.advisorChapterIds.includes(group.chapterId)) {
    throw validationError('Bu grubu görüntüleme yetkiniz yok.');
  }

  const signals = await getGroupSignals(groupId, group.academicYearId);
  const facts = { group: describeGroupSignals(signals) };

  return getOrGenerateInsight({
    insightType: 'advisor_group_summary',
    scopeType: 'group',
    scopeId: groupId,
    programId: group.programId,
    periodKey: isoWeekKey(new Date()),
    facts,
    instruction:
      'Bu grubun güncel durumu için 2-4 cümlelik, nötr ve gerçeklere dayalı bir özet üret: katılım/ödev sinyali, proje ilerlemesi, varsa engel ve sıradaki adım, aktif uyarılar. Öğrenci veya mentörü etiketleme, sıralama yapma.',
    actor,
    forceRegenerate: options.forceRegenerate,
    provider: options.provider,
  });
}

function countByCategory(categories: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const category of categories) counts[category] = (counts[category] ?? 0) + 1;
  return counts;
}

// ---------------------------------------------------------------------------
// Ders modu — "şu anda ters giden ne var"
// ---------------------------------------------------------------------------

/**
 * What is going wrong right now, while it can still be fixed.
 *
 * Every other insight looks back over a week; this one looks at the hour in
 * progress, so it is asked for one thing only: who needs someone to walk
 * over there. The facts it gets are deliberately thin — a chapter without
 * its head, a group whose mentor is away, attendance nobody has taken — and
 * the instruction says to stay quiet when none of that is true, because an
 * assistant that raises something every week teaches people to ignore it.
 */
export async function getClassWatchInsight(
  scope: AccessScope,
  facts: {
    weekNumber: number;
    chapters: {
      chapter: string;
      head: string | null;
      headAbsent: boolean;
      roomsSplit: boolean;
      groups: number;
      mentorsAway: number;
      attendanceMissing: number;
      hasLink: boolean;
    }[];
  },
  actor: Actor,
  options: { forceRegenerate?: boolean; provider?: AiProvider } = {},
): Promise<InsightOutcome> {
  assertPermission(isExecutive(scope.role));

  return getOrGenerateInsight({
    insightType: 'class_watch',
    scopeType: 'organization',
    scopeId: null,
    programId: null,
    // Keyed to the minute so a refresh during the hour re-reads the room.
    periodKey: `${isoWeekKey(new Date())}-w${facts.weekNumber}-${Math.floor(Date.now() / (5 * 60 * 1000))}`,
    facts,
    instruction:
      'Ders şu anda devam ediyor. Sadece ŞU AN müdahale gerektiren durumları söyle: odaları açılmamış chapter, sorumlusu olmayan chapter, mentörü gelmeyen grup, bağlantısı girilmemiş chapter. Her biri için nereye gidilmesi gerektiğini tek cümleyle yaz. Her şey yolundaysa bunu açıkça söyle ve öneri uydurma. Kısa tut.',
    actor,
    forceRegenerate: options.forceRegenerate,
    provider: options.provider,
  });
}
