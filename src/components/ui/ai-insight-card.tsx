import type { AiManagementInsight } from '@/server/ai/insight-schema';

/**
 * Renders a validated `AiManagementInsight`. Every field is already
 * server-validated structured data — this never dumps raw model text or
 * interprets it as HTML, per the "treat model output as untrusted" rule.
 */
export function AiInsightCard({ insight }: { insight: AiManagementInsight }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-navy-800">{insight.summary}</p>

      {insight.positives.length > 0 ? (
        <ul className="space-y-1">
          {insight.positives.map((item, i) => (
            <li key={i} className="text-leaf-700">
              ✅ {item}
            </li>
          ))}
        </ul>
      ) : null}

      {insight.attentionItems.length > 0 ? (
        <ul className="space-y-2">
          {insight.attentionItems.map((item, i) => (
            <li key={i} className="rounded-lg bg-amber-50 px-3 py-2">
              <p className="font-medium text-navy-900">⚠️ {item.title}</p>
              <p className="text-navy-600">{item.evidence}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {insight.recommendedActions.length > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-400">Önerilen aksiyonlar</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-navy-700">
            {insight.recommendedActions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-navy-400">AI tarafından oluşturuldu</p>
    </div>
  );
}
