import { getEnv } from '@/server/env';
import { AI_INSIGHT_JSON_SCHEMA } from './insight-schema';
import {
  AiProviderError,
  AiUnavailableError,
  type AiInsightRequest,
  type AiInsightResult,
  type AiProvider,
} from './provider';

/**
 * Ollama-backed provider, for running an open-weights model (Qwen by
 * default) instead of a hosted API.
 *
 * Uses Ollama's native `/api/chat` rather than its OpenAI-compatible shim:
 * only the native endpoint accepts a full JSON Schema in `format`, which is
 * what constrains the model to the one product-owned insight shape. The
 * compatibility layer only offers `json_object`, which would let the model
 * invent its own keys and fail validation downstream.
 *
 * `OLLAMA_BASE_URL` is read at call time, never cached in a module constant,
 * so a redeploy is not needed to repoint it. It is server-only and never
 * reaches the client.
 *
 * Note on hosting: a serverless function cannot reach `localhost:11434`.
 * Running this in production means pointing `OLLAMA_BASE_URL` at a host the
 * deployment can actually resolve (a tunnel, a private network, or a managed
 * box); locally the default works as-is.
 */

/** Local models are far slower than a hosted API, so the budget is wider. */
const DEFAULT_TIMEOUT_MS = 120_000;

export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';

  get model(): string {
    return getEnv().OLLAMA_MODEL;
  }

  async generateStructuredInsight(input: AiInsightRequest): Promise<AiInsightResult> {
    const env = getEnv();
    const baseUrl = env.OLLAMA_BASE_URL;
    if (!baseUrl) throw new AiUnavailableError('OLLAMA_BASE_URL is not configured.');

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/api/chat`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    // Only set when the instance sits behind an authenticating proxy; a plain
    // local Ollama needs no credential at all.
    if (env.OLLAMA_API_KEY) headers.Authorization = `Bearer ${env.OLLAMA_API_KEY}`;

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: env.OLLAMA_MODEL,
          messages: input.messages,
          stream: false,
          // A full JSON Schema — Ollama constrains decoding to it.
          format: AI_INSIGHT_JSON_SCHEMA,
          options: {
            temperature: 0.2,
            num_predict: input.maxOutputTokens ?? 700,
          },
          // Qwen3 and friends otherwise prepend a reasoning block, which is
          // wasted tokens here: the schema already fixes the output shape.
          think: false,
        }),
        signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new AiProviderError('Ollama request failed.', { cause });
    }

    if (response.status === 404) {
      // Ollama answers 404 for a model it has not pulled — a configuration
      // problem, not a transient one, so it must not read as a generic error.
      throw new AiUnavailableError(`Ollama model "${env.OLLAMA_MODEL}" is not available.`);
    }
    if (!response.ok) {
      throw new AiProviderError(`Ollama responded with status ${response.status}.`);
    }

    const data: unknown = await response.json();
    const content = extractContent(data);
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw new AiProviderError('Ollama returned no content.');
    }
    return { rawContent: stripNonJsonWrapping(content) };
  }
}

function extractContent(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return null;
  const message = (data as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  return (message as { content?: unknown }).content;
}

/**
 * Defensive only. `format` normally yields bare JSON, but a model that
 * ignores `think: false` can still wrap it in a reasoning block or a fenced
 * code block — cheap to undo here, and the result is validated by
 * `parseAiManagementInsight` regardless.
 */
function stripNonJsonWrapping(content: string): string {
  let text = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence?.[1]) text = fence[1].trim();

  return text;
}
