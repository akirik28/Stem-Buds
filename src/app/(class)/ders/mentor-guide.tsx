'use client';

import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { participationLabels, projectStageLabels } from '@/lib/i18n/tr';
import { ChoiceRow, GuideShell, type GuideStep } from './guide-shell';
import {
  mentorAbsentAction,
  reportIssueFromClassAction,
  saveAttendanceAction,
  saveNextHomeworkAction,
  savePreviousHomeworkAction,
  saveWeekAction,
  type StepState,
} from './actions';

type Student = { membershipId: string; fullName: string; previousStatus: string };
type Attendance = 'present' | 'late' | 'absent';
type Homework = 'done' | 'not_done';

const ATTENDANCE = [
  { value: 'present' as const, label: 'Geldi' },
  { value: 'late' as const, label: 'Geç' },
  { value: 'absent' as const, label: 'Gelmedi' },
];

const HOMEWORK = [
  { value: 'done' as const, label: 'Yaptı' },
  { value: 'not_done' as const, label: 'Yapmadı' },
];

const STAGES = (Object.keys(projectStageLabels) as (keyof typeof projectStageLabels)[]).map((key) => ({
  value: key,
  label: projectStageLabels[key],
}));

const PARTICIPATION = (Object.keys(participationLabels) as (keyof typeof participationLabels)[]).map(
  (key) => ({ value: key, label: participationLabels[key] }),
);

/** A save button that reports its own outcome, so no step needs a form. */
function SaveButton({ onSave, label = 'Kaydet' }: { onSave: () => Promise<StepState>; label?: string }) {
  const [state, setState] = useState<StepState>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-4">
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await onSave()))}
        className="mt-2 min-h-11 rounded-[var(--radius-control)] bg-class-accent px-5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Kaydediliyor…' : label}
      </button>
    </div>
  );
}

export function MentorGuide({
  viewerName,
  session,
  roomsSplit,
  students,
  hasPreviousHomework,
  previousHomeworkText,
  alreadyAbsent,
  projectName,
  initial,
}: {
  viewerName: string;
  session: {
    sessionId: string;
    groupId: string;
    groupName: string;
    chapterName: string;
    meetingUrl: string | null;
    weekNumber: number;
  };
  roomsSplit: boolean;
  students: Student[];
  hasPreviousHomework: boolean;
  previousHomeworkText: string | null;
  alreadyAbsent: boolean;
  projectName: string | null;
  initial: {
    whatWeDid: string;
    participation: 'most_active' | 'some_active' | 'low' | null;
    projectStage: keyof typeof projectStageLabels | null;
  };
}) {
  const [attendance, setAttendance] = useState<Record<string, Attendance>>({});
  const [homework, setHomework] = useState<Record<string, Homework>>({});
  const [stage, setStage] = useState(initial.projectStage);
  const [participation, setParticipation] = useState(initial.participation);
  const [summary, setSummary] = useState(initial.whatWeDid);
  const [nextHomework, setNextHomework] = useState('');
  const [issue, setIssue] = useState('');
  const [absenceNote, setAbsenceNote] = useState('');

  const steps: GuideStep[] = [
    {
      title: 'Bağlan',
      content: (
        <div>
          <p className="text-[15px] text-ink-2">
            {session.chapterName} toplantısına katıl. Chapter sorumlusu seni {session.groupName} odasına alacak.
          </p>

          {session.meetingUrl ? (
            <a
              href={session.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block min-h-11 rounded-[var(--radius-control)] bg-class-accent px-6 text-sm font-semibold leading-[2.75rem] text-white"
            >
              Toplantıya katıl →
            </a>
          ) : (
            <Alert tone="warning">
              Chapter sorumlusu henüz bağlantıyı girmemiş. Ona haber ver.
            </Alert>
          )}

          <p className="mt-4 text-sm text-ink-3">
            {roomsSplit ? 'Odalar açıldı.' : 'Odalar henüz açılmadı — birazdan açılır, beklemen gerekmiyor.'}
          </p>

          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-semibold text-ink-2">
              Bu hafta katılamıyorum
            </summary>
            <p className="mt-2 text-sm text-ink-3">
              Chapter sorumluna iletilir, grubun sahipsiz kalmaz.
            </p>
            <input
              type="text"
              value={absenceNote}
              onChange={(event) => setAbsenceNote(event.target.value)}
              placeholder="Kısa sebep (isteğe bağlı)"
              aria-label="Katılamama sebebi"
              className="mt-2 min-h-11 w-full rounded-[var(--radius-control)] border border-line bg-surface px-3 text-sm text-ink"
            />
            {alreadyAbsent ? (
              <p className="mt-2 text-sm font-semibold text-ink-2">Katılamayacağın kaydedildi.</p>
            ) : (
              <SaveButton
                label="Katılamıyorum"
                onSave={() =>
                  mentorAbsentAction({
                    weeklySessionId: session.sessionId,
                    groupId: session.groupId,
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
      title: 'Yoklama',
      content: (
        <div>
          <div className="class-roster">
            {students.map((student) => (
              <div key={student.membershipId} className="class-roster-row">
                <span className="font-semibold text-ink">{student.fullName}</span>
                <ChoiceRow
                  label=""
                  options={ATTENDANCE}
                  value={attendance[student.membershipId] ?? null}
                  onChange={(value) =>
                    setAttendance((previous) => ({ ...previous, [student.membershipId]: value }))
                  }
                />
              </div>
            ))}
          </div>
          {students.length === 0 ? (
            <p className="text-sm text-ink-3">Bu grupta öğrenci yok.</p>
          ) : (
            <SaveButton
              onSave={() =>
                saveAttendanceAction(
                  session.sessionId,
                  students.map((student) => ({
                    groupMembershipId: student.membershipId,
                    status: attendance[student.membershipId] ?? 'absent',
                  })),
                )
              }
            />
          )}
        </div>
      ),
    },
    {
      title: 'Geçen haftanın ödevi',
      when: hasPreviousHomework && students.length > 0,
      content: (
        <div>
          {previousHomeworkText ? (
            <p className="mb-3 text-[15px] text-ink-2">“{previousHomeworkText}”</p>
          ) : null}
          <div className="class-roster">
            {students.map((student) => (
              <div key={student.membershipId} className="class-roster-row">
                <span className="font-semibold text-ink">{student.fullName}</span>
                <ChoiceRow
                  label=""
                  options={HOMEWORK}
                  value={homework[student.membershipId] ?? null}
                  onChange={(value) =>
                    setHomework((previous) => ({ ...previous, [student.membershipId]: value }))
                  }
                />
              </div>
            ))}
          </div>
          <SaveButton
            onSave={() =>
              savePreviousHomeworkAction(
                session.sessionId,
                students.map((student) => ({
                  groupMembershipId: student.membershipId,
                  status: homework[student.membershipId] ?? 'not_done',
                })),
              )
            }
          />
        </div>
      ),
    },
    {
      title: 'Bu hafta',
      content: (
        <div className="space-y-5">
          {projectName ? (
            <ChoiceRow
              label={`Proje: ${projectName} — hangi aşamada?`}
              options={STAGES}
              value={stage}
              onChange={setStage}
            />
          ) : (
            <div>
              <p className="text-sm font-semibold text-ink-2">Proje henüz belirlenmedi.</p>
              <p className="mt-1 text-sm text-ink-3">
                Belirlediyseniz aşamayı işaretleyin; belirlemediyseniz boş bırakın, gelecek hafta sorulur.
              </p>
              <div className="mt-2">
                <ChoiceRow label="" options={STAGES} value={stage} onChange={setStage} />
              </div>
            </div>
          )}

          <ChoiceRow
            label="Grup nasıldı?"
            options={PARTICIPATION}
            value={participation}
            onChange={setParticipation}
          />

          <div>
            <label htmlFor="summary" className="text-sm font-semibold text-ink-2">
              Bu hafta ne yaptınız?
            </label>
            <textarea
              id="summary"
              rows={4}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius-control)] border border-line bg-surface p-3 text-[15px] text-ink"
            />
          </div>

          <SaveButton
            onSave={() =>
              saveWeekAction(session.sessionId, {
                whatWeDid: summary,
                participation,
                projectStage: stage,
              })
            }
          />
        </div>
      ),
    },
    {
      title: 'Kapanış',
      content: (
        <div className="space-y-6">
          <div>
            <label htmlFor="nextHomework" className="text-sm font-semibold text-ink-2">
              Gelecek hafta için ödev
            </label>
            <textarea
              id="nextHomework"
              rows={3}
              value={nextHomework}
              onChange={(event) => setNextHomework(event.target.value)}
              placeholder="Boş bırakırsan ödev yok olarak kaydedilir."
              className="mt-2 w-full rounded-[var(--radius-control)] border border-line bg-surface p-3 text-[15px] text-ink"
            />
            <SaveButton
              label={nextHomework.trim() ? 'Ödevi kaydet' : 'Ödev yok'}
              onSave={() =>
                saveNextHomeworkAction({
                  weeklySessionId: session.sessionId,
                  noHomework: !nextHomework.trim(),
                  description: nextHomework,
                })
              }
            />
          </div>

          <div className="border-t border-line pt-5">
            <label htmlFor="issue" className="text-sm font-semibold text-ink-2">
              Çözemediğin bir şey var mı?
            </label>
            <p className="mt-1 text-sm text-ink-3">
              Yazarsan chapter sorumluna gider; o da çözemezse yukarı taşınır.
            </p>
            <textarea
              id="issue"
              rows={3}
              value={issue}
              onChange={(event) => setIssue(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius-control)] border border-line bg-surface p-3 text-[15px] text-ink"
            />
            {issue.trim().length >= 10 ? (
              <SaveButton
                label="İlet"
                onSave={() => reportIssueFromClassAction(session.groupId, issue)}
              />
            ) : null}
          </div>
        </div>
      ),
    },
  ];

  return (
    <GuideShell
      heading={`${session.groupName} · ${session.weekNumber}. Hafta`}
      subheading={`Merhaba ${viewerName}`}
      steps={steps}
    />
  );
}
