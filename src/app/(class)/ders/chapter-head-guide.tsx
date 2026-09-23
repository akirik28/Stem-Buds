'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { GuideShell, type GuideStep } from './guide-shell';
import { headAbsentAction, roomsSplitAction, saveChapterLinkAction, type StepState } from './actions';

type GroupRow = {
  groupId: string;
  groupName: string;
  mentorName: string | null;
  mentorAbsent: boolean;
  attendanceDone: boolean;
};

function ActionButton({ onRun, label }: { onRun: () => Promise<StepState>; label: string }) {
  const [state, setState] = useState<StepState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await onRun()))}
        className="mt-2 min-h-11 rounded-[var(--radius-control)] bg-class-accent px-6 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Kaydediliyor…' : label}
      </button>
    </div>
  );
}

/**
 * The chapter head's three moves during the hour: open the room, split the
 * groups into it, then walk between them. Everything else they might want
 * is a click away in the panel and does not belong here.
 */
export function ChapterHeadGuide({
  session,
  roomsSplit,
  headAbsent,
  groups,
}: {
  session: {
    chapterId: string;
    chapterName: string;
    meetingUrl: string | null;
    academicYearId: string;
    weekNumber: number;
  };
  roomsSplit: boolean;
  headAbsent: boolean;
  groups: GroupRow[];
}) {
  const [link, setLink] = useState(session.meetingUrl ?? '');
  const [absenceNote, setAbsenceNote] = useState('');

  const steps: GuideStep[] = [
    {
      title: 'Toplantıyı aç',
      content: (
        <div>
          {session.meetingUrl ? (
            <>
              <a
                href={session.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-block min-h-11 rounded-[var(--radius-control)] bg-class-accent px-6 text-sm font-semibold leading-[2.75rem] text-white"
              >
                {session.chapterName} toplantısını aç →
              </a>
              <p className="mt-3 text-sm text-ink-3">
                Mentörler de bu bağlantıyı görüyor.
              </p>
            </>
          ) : (
            <p className="text-[15px] text-ink-2">
              Bu chapter’ın kalıcı toplantı bağlantısı yok. Bir kez gir, yıl boyunca aynı kalsın.
            </p>
          )}

          <details className="mt-6" open={!session.meetingUrl}>
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">
              Bağlantıyı {session.meetingUrl ? 'değiştir' : 'gir'}
            </summary>
            <input
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://meet.google.com/..."
              aria-label="Toplantı bağlantısı"
              className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-ink"
            />
            <ActionButton label="Kaydet" onRun={() => saveChapterLinkAction(session.chapterId, link)} />
          </details>

          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">
              Bu hafta katılamıyorum
            </summary>
            <p className="mt-2 text-sm text-ink-3">Yönetime iletilir, yerine bakılır.</p>
            <input
              type="text"
              value={absenceNote}
              onChange={(event) => setAbsenceNote(event.target.value)}
              placeholder="Kısa sebep (isteğe bağlı)"
              aria-label="Katılamama sebebi"
              className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-ink"
            />
            {headAbsent ? (
              <p className="mt-2 text-sm font-semibold text-ink-2">Katılamayacağın kaydedildi.</p>
            ) : (
              <ActionButton
                label="Katılamıyorum"
                onRun={() =>
                  headAbsentAction({
                    chapterId: session.chapterId,
                    academicYearId: session.academicYearId,
                    weekNumber: session.weekNumber,
                    note: absenceNote,
                  })
                }
              />
            )}
          </details>
        </div>
      ),
    },
    {
      title: 'Grupları odalara ayır',
      content: (
        <div>
          <p className="text-[15px] text-ink-2">
            {groups.length} oda aç, her mentörü kendi grubuna al.
          </p>
          <ul className="class-roster mt-4">
            {groups.map((group) => (
              <li key={group.groupId} className="class-roster-row">
                <span className="font-semibold text-ink">{group.groupName}</span>
                <span className="text-sm text-ink-2">
                  {group.mentorAbsent ? 'Mentör bu hafta yok' : (group.mentorName ?? 'Mentör atanmadı')}
                </span>
              </li>
            ))}
          </ul>
          {roomsSplit ? (
            <p className="mt-4 text-sm font-semibold text-ink-2">Odalar açıldı olarak işaretlendi.</p>
          ) : (
            <ActionButton
              label="Ayırdım"
              onRun={() =>
                roomsSplitAction({
                  chapterId: session.chapterId,
                  academicYearId: session.academicYearId,
                  weekNumber: session.weekNumber,
                })
              }
            />
          )}
        </div>
      ),
    },
    {
      title: 'Odaları dolaş',
      content: (
        <div>
          <p className="text-[15px] text-ink-2">
            Her odaya uğra. Yoklamayı giren gruplar aşağıda işaretli.
          </p>
          <ul className="class-roster mt-4">
            {groups.map((group) => (
              <li key={group.groupId} className="class-roster-row">
                <div>
                  <p className="font-semibold text-ink">{group.groupName}</p>
                  <p className="text-sm text-ink-3">
                    {group.attendanceDone ? 'Yoklama girildi' : 'Yoklama bekliyor'}
                  </p>
                </div>
                <Link
                  href={`/panel/gruplar/${session.chapterId}/${group.groupId}`}
                  className="text-sm font-semibold text-class-accent hover:underline"
                >
                  Grubu aç →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ),
    },
  ];

  return (
    <GuideShell
      heading={`${session.chapterName} · ${session.weekNumber}. Hafta`}
      subheading="Ders modu"
      steps={steps}
    />
  );
}
