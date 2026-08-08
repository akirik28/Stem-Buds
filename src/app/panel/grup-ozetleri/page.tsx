import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireAuthContext } from '@/server/auth/context';
import { isAdvisorTeacher } from '@/server/authz/policy';
import { getActiveAcademicYear } from '@/server/services/academic-year';
import { getProgramById } from '@/server/services/program-service';
import { listChapters } from '@/server/services/chapter-service';
import { listGroupsByProgram, type Group } from '@/server/services/group-service';
import { getAdvisorGroupSummaryInsight } from '@/server/services/management-ai';
import type { InsightOutcome } from '@/server/ai/insight-cache';
import { Card, CardTitle, EmptyState } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { AiInsightCard } from '@/components/ui/ai-insight-card';

export const metadata: Metadata = {
  title: 'Grup Özetleri',
  robots: { index: false, follow: false },
};

const UNAVAILABLE_MESSAGE = 'Bu grup için AI özeti şu anda oluşturulamadı.';

type ProgramSection = {
  programId: string;
  programLabel: string;
  groups: Array<{ group: Group; chapterName: string }>;
};

/**
 * ADVISOR_TEACHER's one bounded AI surface — read-only, per-Program,
 * per-Group cards over facts already inside their authorized Program scope
 * (Section 6.5). No free-form question box, no cross-Program aggregation,
 * no regenerate control: caching already reuses unchanged summaries and
 * regenerates only when a Group's underlying facts actually changed.
 */
export default async function AdvisorGroupSummariesPage() {
  const context = await requireAuthContext();
  if (!isAdvisorTeacher(context.scope.role)) redirect('/panel');

  const activeYear = await getActiveAcademicYear();
  if (!activeYear || context.scope.advisorProgramIds.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-navy-900">Grup Özetleri</h1>
        <EmptyState title="Görüntülenecek yetkili grup bulunmuyor." />
      </div>
    );
  }

  const sections: ProgramSection[] = [];
  for (const programId of context.scope.advisorProgramIds) {
    const program = await getProgramById(programId);
    if (!program) continue;
    const [chapters, groups] = await Promise.all([
      listChapters({ programId }),
      listGroupsByProgram(programId, activeYear.id),
    ]);
    const chapterNames = new Map(chapters.map((c) => [c.id, c.name]));
    const authorizedGroups = groups
      .filter((g) => context.scope.advisorChapterIds.includes(g.chapterId))
      .map((group) => ({ group, chapterName: chapterNames.get(group.chapterId) ?? '' }));
    sections.push({ programId, programLabel: program.shortName, groups: authorizedGroups });
  }

  // Generate every Group's summary in one true sequential loop — never
  // `Promise.all`/fanned-out JSX-async-component rendering — so at most one
  // Groq request for this page is ever in flight at a time (Section 6.5:
  // "do not fan out an unbounded parallel request per Group"). A cache hit
  // resolves near-instantly; only genuinely stale/missing summaries reach
  // Groq, and a rate-limited or failed one just falls back to the
  // unavailable message for that single card without blocking the rest.
  const actor = { id: context.user.id, name: context.user.fullName };
  const insights = new Map<string, InsightOutcome>();
  for (const section of sections) {
    for (const { group } of section.groups) {
      insights.set(group.id, await getAdvisorGroupSummaryInsight(context.scope, group.id, actor));
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-navy-900">Grup Özetleri</h1>
        <p className="mt-1 text-sm text-navy-500">Yetkili olduğunuz gruplar için kısa, gerçeklere dayalı durum özetleri.</p>
      </div>

      {sections.every((s) => s.groups.length === 0) ? (
        <EmptyState title="Görüntülenecek yetkili grup bulunmuyor." />
      ) : (
        sections.map((section) =>
          section.groups.length === 0 ? null : (
            <section key={section.programId} className="space-y-3">
              <h2 className="text-lg font-semibold text-navy-800">{section.programLabel}</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {section.groups.map(({ group, chapterName }) => (
                  <Card key={group.id}>
                    <CardTitle>
                      {chapterName} · {group.name}
                    </CardTitle>
                    <div className="mt-3">
                      {(() => {
                        const result = insights.get(group.id);
                        return result?.status === 'ok' ? (
                          <AiInsightCard insight={result.insight} />
                        ) : (
                          <Alert tone="info">{UNAVAILABLE_MESSAGE}</Alert>
                        );
                      })()}
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ),
        )
      )}
    </div>
  );
}
