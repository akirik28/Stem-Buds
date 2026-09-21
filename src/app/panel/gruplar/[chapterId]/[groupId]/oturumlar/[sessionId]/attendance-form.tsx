'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { attendanceIcons, attendanceLabels } from '@/lib/i18n/tr';
import { initials } from '@/lib/role-theme';
import { cn } from '@/lib/utils';
import { finalizeAttendanceAction, type ActionState } from '../actions';

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused';

type StudentAttendance = {
  membershipId: string;
  fullName: string;
  username: string;
  currentStatus: AttendanceStatus | null;
  currentNote: string | null;
};

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused'];

/**
 * Selected-state styling per status.
 *
 * `excused` is intentionally the `info` family with a dashed edge, never
 * amber or red: a mazeret is an agreed absence and must not read as a
 * failure sitting next to "Katılmadı".
 */
const SELECTED: Record<AttendanceStatus, string> = {
  present: 'bg-ok-soft text-ok ring-ok-line',
  late: 'bg-warn-soft text-warn ring-warn-line',
  absent: 'bg-danger-soft text-danger ring-danger-line',
  excused: 'bg-info-soft text-info ring-info-line border-dashed',
};

function SubmitButton({ marked, total }: { marked: number; total: number }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || marked < total}>
      {pending ? 'Kaydediliyor…' : 'Katılımı Kaydet'}
    </Button>
  );
}

export function AttendanceForm({
  chapterId,
  groupId,
  sessionId,
  students,
  finalized,
}: {
  chapterId: string;
  groupId: string;
  sessionId: string;
  students: StudentAttendance[];
  finalized: boolean;
}) {
  const action = finalizeAttendanceAction.bind(null, chapterId, groupId, sessionId);
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | null>>(() =>
    Object.fromEntries(students.map((s) => [s.membershipId, s.currentStatus])),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(students.map((s) => [s.membershipId, s.currentNote ?? ''])),
  );

  if (students.length === 0) {
    return <p className="mt-2 text-[13px] text-ink-3">Bu grupta henüz öğrenci yok.</p>;
  }

  const marked = students.filter((s) => statuses[s.membershipId]).length;
  const total = students.length;
  const progress = Math.round((marked / total) * 100);

  const markAllPresent = () =>
    setStatuses(Object.fromEntries(students.map((s) => [s.membershipId, 'present' as const])));
  const clearAll = () =>
    setStatuses(Object.fromEntries(students.map((s) => [s.membershipId, null])));

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-3">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      {finalized ? (
        <p className="text-[12px] text-ink-3">
          Katılım daha önce kaydedildi. Yeniden kaydetmek düzeltme olarak işlenir.
        </p>
      ) : null}

      {/* Bulk actions + progress: most weeks everyone is present, so the
          common case should be one tap rather than seven. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={markAllPresent}
          className="min-h-9 rounded-[var(--radius-control)] border border-ok-line bg-ok-soft px-3 text-[12px] font-semibold text-ok"
        >
          Tümünü katıldı işaretle
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="min-h-9 rounded-[var(--radius-control)] border border-line px-3 text-[12px] font-semibold text-ink-3 transition-colors hover:text-ink"
        >
          Temizle
        </button>
        <span className="ml-auto text-[12px] font-medium text-ink-2">
          {marked}/{total} öğrenci işaretlendi
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={marked}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="İşaretlenen öğrenci sayısı"
      >
        <div
          className="h-full rounded-full bg-ok transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {students.map((student) => {
        const status = statuses[student.membershipId] ?? null;
        return (
          <div
            key={student.membershipId}
            className="flex flex-col gap-2.5 rounded-[var(--radius-row)] border border-line bg-surface-2 p-3"
          >
            <input type="hidden" name="membershipId" value={student.membershipId} />
            <input
              type="hidden"
              name={`status-${student.membershipId}`}
              value={status ?? 'present'}
            />

            <div className="flex items-center gap-2.5">
              <span className="grid size-8 flex-none place-items-center rounded-[10px] bg-surface text-[11px] font-bold text-ink-2">
                {initials(student.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{student.fullName}</p>
                <p className="truncate text-[11px] text-ink-3">@{student.username}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {STATUS_ORDER.map((option) => {
                const selected = status === option;
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() =>
                      setStatuses((prev) => ({ ...prev, [student.membershipId]: option }))
                    }
                    className={cn(
                      // 44px is the handoff's floor for these specifically:
                      // they are tapped seven times a week on a phone.
                      'flex min-h-11 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-transparent px-2 text-[12px] font-semibold ring-1 ring-inset transition-colors',
                      selected
                        ? SELECTED[option]
                        : 'bg-surface text-ink-3 ring-line hover:text-ink',
                    )}
                  >
                    <span aria-hidden="true">{attendanceIcons[option]}</span>
                    {attendanceLabels[option]}
                  </button>
                );
              })}
            </div>

            {status === 'excused' ? (
              <label className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-dashed border-info-line bg-info-soft/40 p-2.5">
                <span className="text-[11px] font-semibold text-info">
                  Mazeret, devamsızlık sayılmaz.
                </span>
                <input
                  type="text"
                  name={`note-${student.membershipId}`}
                  value={notes[student.membershipId] ?? ''}
                  onChange={(event) =>
                    setNotes((prev) => ({
                      ...prev,
                      [student.membershipId]: event.target.value,
                    }))
                  }
                  placeholder="Kısa not (isteğe bağlı)"
                  className="min-h-9 rounded-[10px] border border-info-line/60 bg-surface px-2.5 text-[12px] text-ink placeholder:text-ink-3"
                />
              </label>
            ) : (
              <input type="hidden" name={`note-${student.membershipId}`} value="" />
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton marked={marked} total={total} />
        {marked < total ? (
          <span className="text-[12px] text-ink-3">
            {total - marked} öğrenci işaretlenmeyi bekliyor.
          </span>
        ) : null}
      </div>
    </form>
  );
}
