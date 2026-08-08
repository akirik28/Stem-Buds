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

export function CreateUserForm({
  chapterOptions,
}: {
  chapterOptions: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createUserAction, {});
  const [role, setRole] = useState<string>('student');
  const needsChapter = CHAPTER_SCOPED_ROLES.has(role);

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
