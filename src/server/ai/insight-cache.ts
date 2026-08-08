import { createHash } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { aiInsights } from '@/server/db/schema';
import { AUDIT_ACTIONS, recordAudit } from '@/server/services/audit';
import { consumeRateLimit } from '@/server/services/rate-limit';
import { AiProviderError, AiRateLimitError, AiUnavailableError, type AiChatMessage, type AiProvider } from './provider';
import { GroqProvider } from './groq-provider';
import { parseAiManagementInsight, type AiManagementInsight } from './insight-schema';
import { AI_SYSTEM_PROMPT, buildUserPrompt } from './prompts';

/**
 * Cache + rate-limit + provider orchestration for every bounded Phase 5 AI
 * surface. This module never authorizes anything — every caller in
 * `management-ai.ts` asserts the current caller's permission for the exact
 * `scopeId`/`programId` *before* calling in here, on every call, including
 * ones that turn out to be cache hits. A cached row is a performance
 * optimization, never a substitute for that check.
 */

const RPM_BUCKET = 'groq:rpm';
const RPM_LIMIT = 25; // conservative under the org's 30 RPM free-tier cap
const RPM_WINDOW_MS = 60_000;

const RPD_BUCKET = 'groq:rpd';
const RPD_LIMIT = 900; // conservative under the org's 1,000 RPD free-tier cap
const RPD_WINDOW_MS = 24 * 60 * 60 * 1000;

const REGEN_LIMIT_PER_ACTOR = 5;
const REGEN_WINDOW_MS = 5 * 60 * 1000;

let defaultProvider: AiProvider | null = null;
function getDefaultProvider(): AiProvider {
  if (!defaultProvider) defaultProvider = new GroqProvider();
  return defaultProvider;
}

export type AiInsightType =
  | 'weekly_summary'
  | 'chapter_group_status'
  | 'data_question'
  | 'mentor_alert_explainer'
  | 'advisor_group_summary';

export type AiScopeType = 'organization' | 'program' | 'chapter' | 'mentor' | 'group';

export type GetOrGenerateInsightInput = {
  insightType: AiInsightType;
  scopeType: AiScopeType;
  scopeId: string | null;
  programId: string | null;
  periodKey?: string | null;
  /** The exact structured facts sent to the model — also the cache key material. */
  facts: Record<string, unknown>;
  /** A short instruction describing what to produce from `facts`. */
  instruction: string;
  actor: { id: string | null; name: string };
  forceRegenerate?: boolean;
  /** Injected only by tests; production always uses the real Groq provider. */
  provider?: AiProvider;
};

export type InsightOutcome =
  | { status: 'ok'; insight: AiManagementInsight; cached: boolean; generatedAt: Date }
  | { status: 'unavailable'; reason: 'not_configured' | 'rate_limited' | 'malformed_output' | 'provider_error' };

function hashFacts(facts: Record<string, unknown>): string {
  const stable = JSON.stringify(sortKeysDeep(facts));
  return createHash('sha256').update(stable).digest('hex');
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

export async function getOrGenerateInsight(input: GetOrGenerateInsightInput): Promise<InsightOutcome> {
  const db = getDb();
  const contextHash = hashFacts(input.facts);
  const periodKey = input.periodKey ?? null;

  if (!input.forceRegenerate) {
    const [cached] = await db
      .select()
      .from(aiInsights)
      .where(
        and(
          eq(aiInsights.insightType, input.insightType),
          eq(aiInsights.scopeType, input.scopeType),
          input.scopeId ? eq(aiInsights.scopeId, input.scopeId) : isNull(aiInsights.scopeId),
          input.programId ? eq(aiInsights.programId, input.programId) : isNull(aiInsights.programId),
          periodKey ? eq(aiInsights.periodKey, periodKey) : isNull(aiInsights.periodKey),
          eq(aiInsights.contextHash, contextHash),
        ),
      )
      .orderBy(desc(aiInsights.generatedAt))
      .limit(1);

    if (cached) {
      const parsed = parseAiManagementInsight(JSON.stringify(cached.result));
      if (parsed) return { status: 'ok', insight: parsed, cached: true, generatedAt: cached.generatedAt };
      // A corrupted/legacy cache row is treated as a miss, not an error.
    }
  }

  const rpm = await consumeRateLimit(RPM_BUCKET, RPM_LIMIT, RPM_WINDOW_MS);
  if (!rpm.allowed) return { status: 'unavailable', reason: 'rate_limited' };
  const rpd = await consumeRateLimit(RPD_BUCKET, RPD_LIMIT, RPD_WINDOW_MS);
  if (!rpd.allowed) return { status: 'unavailable', reason: 'rate_limited' };
  if (input.forceRegenerate && input.actor.id) {
    const perActor = await consumeRateLimit(`groq:regen:${input.actor.id}`, REGEN_LIMIT_PER_ACTOR, REGEN_WINDOW_MS);
    if (!perActor.allowed) return { status: 'unavailable', reason: 'rate_limited' };
  }

  const provider = input.provider ?? getDefaultProvider();
  const messages: AiChatMessage[] = [
    { role: 'system', content: AI_SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(input.instruction, input.facts) },
  ];

  let rawContent: string;
  try {
    // gpt-oss-120b is a reasoning model: hidden reasoning tokens count
    // against max_completion_tokens before any JSON is emitted, and usage
    // varies run to run even at temperature 0.2. 700 was observed to fail
    // ("max completion tokens reached before generating a valid document")
    // on the real system+user prompt combination; 1500 leaves headroom.
    const result = await provider.generateStructuredInsight({ messages, maxOutputTokens: 1500 });
    rawContent = result.rawContent;
  } catch (error) {
    if (error instanceof AiUnavailableError) return { status: 'unavailable', reason: 'not_configured' };
    if (error instanceof AiRateLimitError) return { status: 'unavailable', reason: 'rate_limited' };
    if (error instanceof AiProviderError) return { status: 'unavailable', reason: 'provider_error' };
    return { status: 'unavailable', reason: 'provider_error' };
  }

  const parsed = parseAiManagementInsight(rawContent);
  if (!parsed) return { status: 'unavailable', reason: 'malformed_output' };

  const [row] = await db
    .insert(aiInsights)
    .values({
      insightType: input.insightType,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      programId: input.programId,
      periodKey,
      contextHash,
      result: parsed,
      provider: provider.name,
      model: provider.model,
      generatedByUserId: input.actor.id,
    })
    .returning();

  await recordAudit({
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    action: AUDIT_ACTIONS.aiInsightGenerated,
    targetType: 'ai_insight',
    targetId: row?.id ?? null,
    after: { insightType: input.insightType, scopeType: input.scopeType, provider: provider.name, model: provider.model },
  });

  return { status: 'ok', insight: parsed, cached: false, generatedAt: row?.generatedAt ?? new Date() };
}
