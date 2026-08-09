import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNavigation } from '@/app/panel/navigation';
import type { AccessScope } from '@/server/authz/policy';

/**
 * Regression guard for the exact bug class that shipped `/panel/denetim-kaydi`
 * with no `page.tsx`: a navigation item authorized for some role but whose
 * destination was never actually implemented. Every role is exercised so
 * every conditional branch in `buildNavigation` is covered, not just the
 * Executive's (largest) menu.
 */

function scope(overrides: Partial<AccessScope> & Pick<AccessScope, 'userId' | 'role'>): AccessScope {
  return {
    headChapterIds: [],
    memberChapterIds: [],
    mentorGroupIds: [],
    studentGroupIds: [],
    teamLeaderGroupIds: [],
    advisorProgramIds: [],
    advisorChapterIds: [],
    ...overrides,
  };
}

const scopesByRole: AccessScope[] = [
  scope({ userId: 'exec-1', role: 'regional_director' }),
  scope({ userId: 'exec-2', role: 'vice_president' }),
  scope({ userId: 'head-1', role: 'chapter_head', headChapterIds: ['chapter-1'], memberChapterIds: ['chapter-1'] }),
  scope({ userId: 'mentor-1', role: 'mentor', memberChapterIds: ['chapter-1'], mentorGroupIds: ['group-1'] }),
  scope({ userId: 'student-1', role: 'student', memberChapterIds: ['chapter-1'], studentGroupIds: ['group-1'] }),
  scope({ userId: 'advisor-1', role: 'advisor_teacher', advisorProgramIds: ['program-1'], advisorChapterIds: ['chapter-1'] }),
];

describe('panel navigation integrity', () => {
  it('every navigation item, across every role, points to a route that actually has a page.tsx on disk', () => {
    const hrefs = new Set<string>();
    for (const roleScope of scopesByRole) {
      for (const item of buildNavigation(roleScope)) {
        hrefs.add(item.href);
      }
    }

    // Sanity check that this test is exercising something real, not an empty set.
    expect(hrefs.size).toBeGreaterThan(5);

    for (const href of hrefs) {
      expect(href.startsWith('/panel')).toBe(true);
      const relative = href === '/panel' ? '' : href.slice('/panel/'.length);
      const pagePath = path.join(process.cwd(), 'src', 'app', 'panel', relative, 'page.tsx');
      expect(existsSync(pagePath), `Navigation links to "${href}" but no page exists at ${pagePath}`).toBe(true);
    }
  });

  it('does not prefetch every database-backed panel destination at once', () => {
    const navPath = path.join(process.cwd(), 'src', 'app', 'panel', 'platform-nav.tsx');
    const source = readFileSync(navPath, 'utf8');
    expect(source).toContain('prefetch={false}');
  });
});
