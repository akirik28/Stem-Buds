import { getEnv } from '@/server/env';
import { AI_INSIGHT_JSON_SCHEMA } from './insight-schema';
import {
  AiProviderError,
  AiRateLimitError,
  AiUnavailableError,
  type AiInsightRequest,
  type AiInsightResult,
  type AiProvider,
} from './provider';

const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Server-only. `GROQ_API_KEY` is read from `getEnv()` at call time — never
 * cached in a module-level constant, never logged, never included in any
 * response sent back to the client.
 */
export class GroqProvider implements AiProvider {
  readonly name = 'groq';
  readonly model = GROQ_MODEL;

  async generateStructuredInsight(input: AiInsightRequest): Promise<AiInsightResult> {
    const apiKey = getEnv().GROQ_API_KEY;
    if (!apiKey) throw new AiUnavailableError('GROQ_API_KEY is not configured.');

    let response: Response;
    try {
      response = await fetch(GROQ_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: input.messages,
          temperature: 0.2,
          max_completion_tokens: input.maxOutputTokens ?? 700,
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'ai_management_insight',
              strict: true,
              schema: AI_INSIGHT_JSON_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new AiProviderError('Groq request failed.', { cause });
    }

    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after');
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
      throw new AiRateLimitError(Number.isFinite(retryAfterMs) ? retryAfterMs : undefined);
    }
    if (!response.ok) {
      throw new AiProviderError(`Groq responded with status ${response.status}.`);
    }

    const data: unknown = await response.json();
    const content = extractContent(data);
    if (typeof content !== 'string' || content.length === 0) {
      throw new AiProviderError('Groq returned no content.');
    }
    return { rawContent: content };
  }
}

function extractContent(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return null;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (typeof first !== 'object' || first === null) return null;
  const message = (first as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  return (message as { content?: unknown }).content;
}
