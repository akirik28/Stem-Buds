import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listUndeliveredEmails, sendEmail } from '@/server/services/email-service';
import type { EmailMessage, EmailProvider, EmailSendResult } from '@/server/email/provider';
import { closeTestDb, resetDatabase } from '../helpers/db';

class FakeProvider implements EmailProvider {
  readonly name = 'fake';
  calls: EmailMessage[] = [];
  nextResult: EmailSendResult = { delivered: true };

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.calls.push(message);
    return this.nextResult;
  }
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await closeTestDb();
});

describe('sendEmail', () => {
  it('sends once and logs status=sent on success', async () => {
    const provider = new FakeProvider();
    const log = await sendEmail({
      idempotencyKey: 'welcome-user-1',
      template: 'welcome',
      recipientEmail: 'a@example.com',
      subject: 'Hoş geldiniz',
      body: 'Merhaba',
      provider,
    });
    expect(log.status).toBe('sent');
    expect(log.sentAt).not.toBeNull();
    expect(provider.calls).toHaveLength(1);
  });

  it('never sends twice for the same idempotencyKey once terminal (sent/skipped)', async () => {
    const provider = new FakeProvider();
    await sendEmail({ idempotencyKey: 'dup-key', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider });
    await sendEmail({ idempotencyKey: 'dup-key', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider });
    expect(provider.calls).toHaveLength(1);
  });

  it('logs status=skipped without marking it as delivered when the provider skips', async () => {
    const provider = new FakeProvider();
    provider.nextResult = { delivered: false, skipped: true };
    const log = await sendEmail({ idempotencyKey: 'skip-key', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider });
    expect(log.status).toBe('skipped');
    expect(log.sentAt).toBeNull();
  });

  it('retries a previously-failed send and can succeed the second time', async () => {
    const failing = new FakeProvider();
    failing.nextResult = { delivered: false, skipped: false, error: 'boom' };
    const firstLog = await sendEmail({ idempotencyKey: 'retry-key', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider: failing });
    expect(firstLog.status).toBe('failed');
    expect(firstLog.attemptCount).toBe(1);

    const succeeding = new FakeProvider();
    const secondLog = await sendEmail({ idempotencyKey: 'retry-key', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider: succeeding });
    expect(secondLog.status).toBe('sent');
    expect(secondLog.attemptCount).toBe(2);
    expect(succeeding.calls).toHaveLength(1);
  });

  it('never logs the provider’s raw error text — only the safe message it returned', async () => {
    const provider = new FakeProvider();
    provider.nextResult = { delivered: false, skipped: false, error: 'SMTP send failed.' };
    const log = await sendEmail({ idempotencyKey: 'safe-error-key', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider });
    expect(log.errorMessage).toBe('SMTP send failed.');
  });
});

describe('listUndeliveredEmails', () => {
  it('includes pending and failed, excludes sent and skipped', async () => {
    const failing = new FakeProvider();
    failing.nextResult = { delivered: false, skipped: false, error: 'x' };
    await sendEmail({ idempotencyKey: 'k1', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider: failing });

    const succeeding = new FakeProvider();
    await sendEmail({ idempotencyKey: 'k2', template: 'welcome', recipientEmail: 'a@example.com', subject: 'x', body: 'y', provider: succeeding });

    const undelivered = await listUndeliveredEmails();
    expect(undelivered.map((e) => e.idempotencyKey)).toEqual(['k1']);
  });
});
