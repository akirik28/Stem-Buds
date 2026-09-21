import './load-env';
import { OllamaProvider } from '../src/server/ai/ollama-provider';
import { GroqProvider } from '../src/server/ai/groq-provider';
import { parseAiManagementInsight } from '../src/server/ai/insight-schema';
import { AI_SYSTEM_PROMPT, buildUserPrompt } from '../src/server/ai/prompts';
import type { AiProvider } from '../src/server/ai/provider';

/**
 * Throwaway smoke test for the AI boundary: sends one realistic
 * weekly-summary payload and checks the answer survives
 * `parseAiManagementInsight`. Touches no database and writes nothing.
 *
 * The facts below are invented, but shaped exactly like the real ones in
 * `management-ai.ts` — aggregates and IDs, never a student's name.
 */

const FACTS = {
  period: '2026-W39',
  program: 'ALL',
  kpis: {
    activeChapters: 3,
    activeGroups: 4,
    attendance: { percent: 83, means: 'derse katılan öğrenci yüzdesi (yüksek = iyi)' },
    homeworkCompletion: { percent: 61, means: 'ödevini tamamlayan öğrenci yüzdesi (yüksek = iyi)' },
    weeklyRecordCompletion: { percent: 50, means: 'mentörün haftalık kaydı doldurma yüzdesi (yüksek = iyi)' },
    projectsNeedingAttention: 2,
    openAlerts: 6,
  },
  activeAlertCounts: {
    attendance_drop: 2,
    homework_missing: 3,
    chapter_meeting_overdue: 1,
  },
  topAttentionGroups: [
    { category: 'attendance_drop', severity: 'high', title: 'Grup B: üst üste iki hafta devamsızlık artışı' },
    { category: 'homework_missing', severity: 'medium', title: 'Grup C: ödev teslimi %40’a düştü' },
    { category: 'chapter_meeting_overdue', severity: 'low', title: 'UAA chapter toplantısı 3 haftadır yapılmadı' },
  ],
};

const INSTRUCTION =
  'Bu haftanın organizasyon genelindeki durumunu yöneticiler için özetle. Öne çıkan olumlu noktaları, dikkat gerektiren başlıkları ve önerilen aksiyonları ayrı ayrı ver.';

async function run(provider: AiProvider): Promise<void> {
  const label = `${provider.name} (${provider.model})`;
  process.stdout.write(`\n=== ${label} ===\n`);

  const startedAt = Date.now();
  try {
    const { rawContent } = await provider.generateStructuredInsight({
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(INSTRUCTION, FACTS) },
      ],
      maxOutputTokens: 700,
    });
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

    // `null` means the model answered but the answer did not fit the product
    // schema — the exact case the panel treats as "unavailable" rather than
    // rendering, so it is a failure here too.
    const insight = parseAiManagementInsight(rawContent);
    if (!insight) {
      process.stdout.write(`ŞEMA DOĞRULANAMADI · ${elapsed}s\n`);
      process.stdout.write(`  ham çıktı (ilk 400 karakter):\n  ${rawContent.slice(0, 400)}\n`);
      process.exitCode = 1;
      return;
    }

    process.stdout.write(`şema doğrulandı · ${elapsed}s\n\n`);
    process.stdout.write(`ÖZET\n${insight.summary}\n\n`);
    process.stdout.write(`OLUMLU (${insight.positives.length})\n`);
    for (const p of insight.positives) process.stdout.write(`  · ${p}\n`);
    process.stdout.write(`\nDİKKAT (${insight.attentionItems.length})\n`);
    for (const a of insight.attentionItems) process.stdout.write(`  · ${a.title}\n    ${a.evidence}\n`);
    process.stdout.write(`\nAKSİYON (${insight.recommendedActions.length})\n`);
    for (const r of insight.recommendedActions) process.stdout.write(`  · ${r}\n`);
  } catch (error) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    process.stdout.write(`BAŞARISIZ · ${elapsed}s\n`);
    process.stdout.write(`  ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const which = process.argv[2] ?? 'ollama';
  if (which === 'groq') await run(new GroqProvider());
  else await run(new OllamaProvider());
}

void main();
