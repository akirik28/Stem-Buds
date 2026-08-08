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
import { getGroupSignals } from './group-signals';
import { listAlertsForMentor, listAlertsForViewer, getManagementKpis } from './alert-query';
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
    kpis,
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
  const facts = { period, chapterRef: chapter.name, groups: groupSignals };

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
    kpis,
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
  const facts = { group: signals };

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
