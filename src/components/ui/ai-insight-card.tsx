import type { AiManagementInsight } from '@/server/ai/insight-schema';

/**
 * Renders a validated `AiManagementInsight`. Every field is already
 * server-validated structured data — this never dumps raw model text or
 * interprets it as HTML, per the "treat model output as untrusted" rule.
 */
export function AiInsightCard({ insight }: { insight: AiManagementInsight }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-ink">{insight.summary}</p>

      {insight.positives.length > 0 ? (
        <ul className="space-y-1">
          {insight.positives.map((item, i) => (
            <li key={i} className="flex gap-2 text-ok">
              <span aria-hidden="true">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {insight.attentionItems.length > 0 ? (
        <ul className="space-y-2">
          {insight.attentionItems.map((item, i) => (
            // `bg-warn-soft` rather than a hard-coded amber: the soft tokens
            // are the ones paired with `--ink` per theme, so the title stays
            // readable. A literal `bg-amber-50` put near-white text on cream.
            <li
              key={i}
              className="rounded-[var(--radius-row)] bg-warn-soft px-3 py-2 ring-1 ring-inset ring-warn-line"
            >
              <p className="flex gap-2 font-medium text-ink">
                <span aria-hidden="true">!</span>
                <span>{item.title}</span>
              </p>
              <p className="mt-0.5 text-ink-2">{item.evidence}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {insight.recommendedActions.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-3">Önerilen aksiyonlar</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-ink-2">
            {insight.recommendedActions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-ink-3">AI tarafından oluşturuldu</p>
    </div>
  );
}
