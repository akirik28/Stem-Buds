'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { roleLabels } from '@/lib/i18n/tr';
import { createUserAction, type ActionState } from './actions';
import { CredentialReveal } from './credential-reveal';

const CHAPTER_SCOPED_ROLES = new Set(['chapter_head', 'mentor', 'student']);

const ASSIGNABLE_ROLES = [
  'student',
  'mentor',
  'chapter_head',
  'advisor_teacher',
  'parent',
  'vice_president',
  'regional_director',
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Oluşturuluyor…' : 'Kullanıcı oluştur'}
    </Button>
  );
}

export type StudentOption = { id: string; label: string };

export function CreateUserForm({
  chapterOptions,
  studentOptions,
  programOptions,
}: {
  chapterOptions: { id: string; label: string }[];
  studentOptions: StudentOption[];
  programOptions: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createUserAction, {});
  const [role, setRole] = useState<string>('student');
  const needsChapter = CHAPTER_SCOPED_ROLES.has(role);
  const needsPrograms = role === 'advisor_teacher';
  const needsStudents = role === 'parent';

  if (state.credential) {
    return <CredentialReveal credential={state.credential} title="Kullanıcı oluşturuldu" />;
  }

  return (
    <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
      {state.error ? <Alert tone="error" className="sm:col-span-2">{state.error}</Alert> : null}

      <Field label="Kullanıcı adı" htmlFor="username" required hint="Küçük harf, rakam, nokta, tire, alt çizgi">
        <Input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={64}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>

      <Field label="Ad Soyad" htmlFor="fullName" required>
        <Input id="fullName" name="fullName" required minLength={2} maxLength={160} />
      </Field>

      <Field label="Rol" htmlFor="role" required>
        <Select id="role" name="role" required value={role} onChange={(e) => setRole(e.target.value)}>
          {ASSIGNABLE_ROLES.map((value) => (
            <option key={value} value={value}>
              {roleLabels[value]}
            </option>
          ))}
        </Select>
      </Field>

      {needsChapter ? (
        <Field label="Chapter" htmlFor="chapterId" required hint="Aktif akademik yıl için">
          <Select id="chapterId" name="chapterId" required={needsChapter}>
            <option value="">Seçiniz</option>
            {chapterOptions.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {needsPrograms ? (
        <fieldset className="sm:col-span-2">
          <legend className="block text-sm font-medium text-ink">
            Programlar <span className="ml-1 text-danger">*</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {programOptions.map((program) => (
              <label key={program.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="programIds"
                  value={program.id}
                  className="h-4 w-4 rounded border-line"
                />
                {program.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Her iki program da seçilirse organizasyon geneli görünürlük tanımlanır.
          </p>
        </fieldset>
      ) : null}

      {needsStudents ? (
        <fieldset className="rounded-[var(--radius-row)] border border-line p-3">
          <legend className="px-1 text-sm font-medium text-ink">Bağlı öğrenci</legend>
          {studentOptions.length === 0 ? (
            <p className="mt-2 text-xs text-ink-3">
              Önce öğrenci hesabı oluşturun; veli hesabı bir öğrenciye bağlanmadan hiçbir şey
              göremez.
            </p>
          ) : (
            <>
              <div className="mt-2 flex max-h-44 flex-col gap-2 overflow-y-auto">
                {studentOptions.map((student) => (
                  <label key={student.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="parentOfStudentUserIds"
                      value={student.id}
                      className="h-4 w-4 rounded border-line"
                    />
                    {student.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-3">
                Velinin göreceği her şey buradan türetilir: yalnızca seçtiğiniz öğrencinin
                kayıtları ve o öğrencinin grubunun genel bilgileri.
              </p>
            </>
          )}
        </fieldset>
      ) : null}

      <Field
        label="Bildirim e-postası"
        htmlFor="notificationEmail"
        hint="Opsiyonel; giriş bilgisi olarak kullanılmaz"
      >
        <Input id="notificationEmail" name="notificationEmail" type="email" maxLength={254} />
      </Field>

      <div className="sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
