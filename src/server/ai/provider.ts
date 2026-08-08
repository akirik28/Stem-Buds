/**
 * The provider-agnostic AI boundary. Product logic (`insight-cache.ts`,
 * `management-ai.ts`) depends only on this interface, never on Groq
 * specifics, so the provider can be swapped later without touching any
 * caller.
 */

export type AiChatMessage = { role: 'system' | 'user'; content: string };

export type AiInsightRequest = {
  messages: AiChatMessage[];
  maxOutputTokens?: number;
};

export type AiInsightResult = { rawContent: string };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateStructuredInsight(input: AiInsightRequest): Promise<AiInsightResult>;
}

export class AiUnavailableError extends Error {
  constructor(message = 'AI provider is not configured.') {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

export class AiRateLimitError extends Error {
  readonly retryAfterMs?: number;
  constructor(retryAfterMs?: number) {
    super('AI provider rate limit reached.');
    this.name = 'AiRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class AiProviderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiProviderError';
  }
}
