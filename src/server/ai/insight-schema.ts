import { z } from 'zod';

/**
 * The one product-owned structured shape every bounded Phase 5 AI surface
 * returns. Model output is untrusted until it passes this validator — never
 * rendered, cached, or returned to the client otherwise.
 */
export const aiManagementInsightSchema = z.object({
  summary: z.string().min(1).max(1000),
  positives: z.array(z.string().max(300)).max(5),
  attentionItems: z
    .array(
      z.object({
        title: z.string().max(150),
        evidence: z.string().max(400),
        sourceAlertTypes: z.array(z.string().max(60)).max(10),
      }),
    )
    .max(8),
  recommendedActions: z.array(z.string().max(300)).max(5),
});

export type AiManagementInsight = z.infer<typeof aiManagementInsightSchema>;

/**
 * Groq Structured Outputs JSON Schema — `strict: true` requires every field
 * `required` and `additionalProperties: false` at every level.
 */
export const AI_INSIGHT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    positives: { type: 'array', items: { type: 'string' } },
    attentionItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          evidence: { type: 'string' },
          sourceAlertTypes: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'evidence', 'sourceAlertTypes'],
        additionalProperties: false,
      },
    },
    recommendedActions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'positives', 'attentionItems', 'recommendedActions'],
  additionalProperties: false,
} as const;

/** Parses and validates raw model output. Returns null for anything malformed. */
export function parseAiManagementInsight(raw: string): AiManagementInsight | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = aiManagementInsightSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
