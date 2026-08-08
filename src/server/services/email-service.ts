import { eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db';
import { emailLogs } from '@/server/db/schema';
import { getEnv } from '@/server/env';
import { MockEmailProvider } from '@/server/email/mock-provider';
import { SmtpProvider } from '@/server/email/smtp-provider';
import type { EmailProvider } from '@/server/email/provider';

/**
 * Idempotent, logged e-mail dispatch on top of the pre-scaffolded
 * `email_logs` table. `idempotencyKey` is unique, so calling this twice for
 * the same logical message (a retried job, a duplicate trigger) can never
 * send twice — the second call is a no-op against the already-logged row.
 *
 * Real delivery only ever happens when `EMAIL_TRANSPORT=smtp` is
 * explicitly configured; the zod-schema default (`mock`) never opens a
 * network connection, logging every message as `skipped` instead. Tests
 * always inject an explicit provider rather than relying on whatever this
 * process's environment happens to have configured.
 */

export type SendEmailInput = {
  idempotencyKey: string;
  template: string;
  recipientEmail: string;
  recipientUserId?: string | null;
  subject: string;
  body: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  /** Injected only by tests/the job runner; production uses the env-selected provider. */
  provider?: EmailProvider;
};

export type EmailLog = typeof emailLogs.$inferSelect;

let defaultProvider: EmailProvider | null = null;
function getDefaultProvider(): EmailProvider {
  if (!defaultProvider) {
    defaultProvider = getEnv().EMAIL_TRANSPORT === 'smtp' ? new SmtpProvider() : new MockEmailProvider();
  }
  return defaultProvider;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailLog> {
  const db = getDb();

  // Only a terminal outcome (`sent`/`skipped`) short-circuits a retry —
  // `pending` (e.g. the process crashed between insert and dispatch) and
  // `failed` both fall through to a genuine attempt, which is what makes
  // `listUndeliveredEmails`'s retry queue actually able to make progress.
  const [existing] = await db.select().from(emailLogs).where(eq(emailLogs.idempotencyKey, input.idempotencyKey)).limit(1);
  if (existing && (existing.status === 'sent' || existing.status === 'skipped')) return existing;

  const row =
    existing ??
    (
      await db
        .insert(emailLogs)
        .values({
          idempotencyKey: input.idempotencyKey,
          template: input.template,
          recipientEmail: input.recipientEmail,
          recipientUserId: input.recipientUserId ?? null,
          subject: input.subject,
          status: 'pending',
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
        })
        .returning()
    )[0];
  if (!row) throw new Error('Failed to create email log row.');

  const provider = input.provider ?? getDefaultProvider();
  const result = await provider.send({ to: input.recipientEmail, subject: input.subject, text: input.body });

  const statusPatch = result.delivered
    ? { status: 'sent' as const, sentAt: new Date(), errorMessage: null }
    : result.skipped
      ? { status: 'skipped' as const, errorMessage: null }
      : { status: 'failed' as const, errorMessage: result.error };

  const [updated] = await db
    .update(emailLogs)
    .set({ ...statusPatch, attemptCount: row.attemptCount + 1, updatedAt: new Date() })
    .where(eq(emailLogs.id, row.id))
    .returning();
  if (!updated) throw new Error('Failed to update email log row.');
  return updated;
}

/** Every currently-`pending` or `failed` log — the job runner's retry queue. */
export async function listUndeliveredEmails(limit = 50): Promise<EmailLog[]> {
  return getDb().select().from(emailLogs).where(inArray(emailLogs.status, ['pending', 'failed'])).limit(limit);
}
