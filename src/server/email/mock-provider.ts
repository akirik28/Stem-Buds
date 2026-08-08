import type { EmailProvider, EmailMessage, EmailSendResult } from './provider';

/**
 * The default provider (`EMAIL_TRANSPORT=mock`, the zod-schema default).
 * Never opens a network connection — every message is deliberately
 * unsent, logged to the server console only for local visibility. This is
 * the platform's safety net against ever sending a real email without an
 * operator explicitly configuring SMTP.
 */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    // eslint-disable-next-line no-console
    console.log(`[email:mock] would send to ${message.to}: ${message.subject}`);
    return { delivered: false, skipped: true };
  }
}
