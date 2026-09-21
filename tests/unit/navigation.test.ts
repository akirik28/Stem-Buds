import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNavigation, flattenNavigation } from '@/app/panel/navigation';
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
    parentStudentUserIds: [],
    parentGroupIds: [],
    parentChapterIds: [],
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
      for (const item of flattenNavigation(buildNavigation(roleScope))) {
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

  /**
   * The shell renders a heading per group. A group that survived with no
   * items would draw a bare label over empty space — the exact "gap-toothed"
   * result the grouping exists to avoid for the smaller roles.
   */
  it('never returns an empty group, for any role', () => {
    for (const roleScope of scopesByRole) {
      for (const group of buildNavigation(roleScope)) {
        expect(group.items.length, `Empty group "${group.title}" for ${roleScope.role}`).toBeGreaterThan(0);
        expect(group.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('gives every role Panelim first, so the shell always has a home', () => {
    for (const roleScope of scopesByRole) {
      const first = flattenNavigation(buildNavigation(roleScope))[0];
      expect(first?.href).toBe('/panel');
    }
  });

  it('does not prefetch every database-backed panel destination at once', () => {
    for (const file of ['sidebar.tsx', 'mobile-nav.tsx']) {
      const source = readFileSync(path.join(process.cwd(), 'src', 'app', 'panel', file), 'utf8');
      expect(source, `${file} should opt out of prefetching`).toContain('prefetch={false}');
    }
  });
});
