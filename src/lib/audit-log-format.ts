import { auditActionLabels } from '@/lib/i18n/tr';

/**
 * Turkish, one-line description of an audit-log entry, e.g.
 * `"Hande Özcan grubun mentorunu değiştirdi: "Bio 2" (UAA)"`.
 *
 * An action code with no known label (a future addition, or a historical
 * code no longer produced) still renders a complete, understandable Turkish
 * sentence — the raw code is kept only as parenthesised technical detail,
 * never the primary text.
 */
export function describeAuditEntry(entry: {
  actorName: string;
  action: string;
  targetLabel?: string | null;
  chapterName?: string | null;
}): string {
  const knownLabel = auditActionLabels[entry.action];
  const verbPhrase = knownLabel ?? `bir işlem gerçekleştirdi (${entry.action})`;

  let text = `${entry.actorName} ${verbPhrase}`;
  if (entry.targetLabel) text += `: "${entry.targetLabel}"`;
  if (entry.chapterName) text += ` (${entry.chapterName})`;
  return text;
}
