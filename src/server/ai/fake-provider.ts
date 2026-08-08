import { AiProviderError, AiRateLimitError, type AiInsightRequest, type AiInsightResult, type AiProvider } from './provider';
import type { AiManagementInsight } from './insight-schema';

const DEFAULT_FIXTURE: AiManagementInsight = {
  summary: 'Test özeti.',
  positives: ['Test olumlu nokta.'],
  attentionItems: [{ title: 'Test dikkat noktası', evidence: 'Test kanıt.', sourceAlertTypes: ['attendance_risk'] }],
  recommendedActions: ['Test önerisi.'],
};

/**
 * Deterministic test double for `AiProvider`. Never used at runtime outside
 * `tests/**` — production code always constructs `GroqProvider`.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = 'fake';
  readonly model = 'fake-model';

  callCount = 0;
  lastRequest: AiInsightRequest | null = null;

  constructor(
    private readonly behavior: 'success' | 'malformed' | 'timeout' | 'rate_limit' | 'error' = 'success',
    private readonly fixture: AiManagementInsight = DEFAULT_FIXTURE,
  ) {}

  async generateStructuredInsight(input: AiInsightRequest): Promise<AiInsightResult> {
    this.callCount += 1;
    this.lastRequest = input;

    if (this.behavior === 'rate_limit') throw new AiRateLimitError(1000);
    if (this.behavior === 'timeout' || this.behavior === 'error') {
      throw new AiProviderError(`Fake provider forced ${this.behavior}.`);
    }
    if (this.behavior === 'malformed') return { rawContent: '{ this is not valid json' };
    return { rawContent: JSON.stringify(this.fixture) };
  }
}
