'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  escalateIssueAction,
  resolveIssueAction,
  type IssueActionState,
} from '@/app/panel/gruplar/[chapterId]/[groupId]/issue-actions';

/**
 * The two moves available on a reported issue that is currently yours:
 * close it, or say you could not and hand it up. Nothing else — a third
 * option would be a decision the chain is supposed to make for you.
 *
 * Closing asks for a line about what happened, because the next person to
 * read this group's history is the one who benefits from it.
 */
export function IssueControls({ issueId }: { issueId: string }) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<IssueActionState>({});
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<IssueActionState>) =>
    startTransition(async () => setState(await fn()));

  return (
    <div className="mt-2.5">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Nasıl çözüldü?"
          aria-label="Çözüm notu"
          className="min-h-9 flex-1 rounded-[var(--radius-control)] border border-line bg-surface-2 px-3 text-[13px] text-ink placeholder:text-ink-3"
        />
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => resolveIssueAction(issueId, note))}
        >
          Çözüldü
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => escalateIssueAction(issueId))}
        >
          Çözemedim, üste ilet
        </Button>
      </div>
    </div>
  );
}
