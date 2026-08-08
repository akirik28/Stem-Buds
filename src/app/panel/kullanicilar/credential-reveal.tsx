'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * One-time display of a username + temporary password.
 *
 * This is the only place these values ever appear — they are never stored
 * client-side beyond this render, never logged, and this component is not
 * rendered again after the page is left.
 */
export function CredentialReveal({
  credential,
  title,
}: {
  credential: { username: string; temporaryPassword: string };
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = `Kullanıcı adı: ${credential.username}\nGeçici şifre: ${credential.temporaryPassword}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      <Alert tone="success">{title}</Alert>
      <div className="rounded-lg border border-navy-200 bg-navy-50 p-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-navy-500">Kullanıcı adı</dt>
          <dd className="font-mono text-navy-900">{credential.username}</dd>
          <dt className="text-navy-500">Geçici şifre</dt>
          <dd className="font-mono text-navy-900">{credential.temporaryPassword}</dd>
        </dl>
        <p className="mt-3 text-xs text-navy-500">
          Bu bilgiler yalnızca şimdi gösteriliyor ve hiçbir yerde saklanmıyor. Kullanıcı ilk
          girişte kalıcı bir şifre belirlemek zorunda kalacak.
        </p>
        <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={copy}>
          {copied ? 'Kopyalandı ✓' : 'Kullanıcı adı + geçici şifreyi kopyala'}
        </Button>
      </div>
    </div>
  );
}
