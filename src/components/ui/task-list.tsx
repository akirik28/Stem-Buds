import Link from 'next/link';
import type { Task } from '@/server/services/task-service';

/**
 * The ordered list of things to do, worked from the top.
 *
 * Numbered rather than bulleted because the order is the point — the list is
 * sorted by urgency, and a number says "this one first" where a bullet says
 * "these are all the same". Urgency is also written out next to the number,
 * so the colour is never the only thing carrying it.
 */

const SEVERITY_TEXT: Record<string, string> = {
  red: 'text-danger',
  yellow: 'text-warn',
  info: 'text-info',
};

const SEVERITY_LABEL: Record<string, string> = {
  red: 'Acil',
  yellow: 'Takip',
  info: 'Bilgi',
};

export function TaskList({ tasks }: { tasks: readonly Task[] }) {
  return (
    <ol className="divide-y divide-line-soft">
      {tasks.map((task, index) => (
        <li key={task.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
          <span className="mt-0.5 w-5 shrink-0 text-right font-mono text-[13px] text-ink-3">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span
                className={`text-[11px] font-bold uppercase tracking-[0.12em] ${SEVERITY_TEXT[task.severity] ?? 'text-ink-3'}`}
              >
                {SEVERITY_LABEL[task.severity] ?? ''}
              </span>
              <p className="font-medium text-ink">{task.title}</p>
            </div>
            <p className="mt-0.5 text-sm text-ink-2">{task.detail}</p>
          </div>
          {task.href ? (
            <Link
              href={task.href}
              className="mt-0.5 shrink-0 self-start text-sm text-ink-3 hover:text-ink-2"
            >
              Aç →
            </Link>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
