import nodemailer from 'nodemailer';
import { getEnv } from '@/server/env';
import type { EmailProvider, EmailMessage, EmailSendResult } from './provider';

/**
 * Real delivery, only ever reached when `EMAIL_TRANSPORT=smtp` is set
 * explicitly — never the default. `SMTP_*` credentials are read from
 * `getEnv()` at send time, never cached in a module constant, never
 * logged, never included in any response.
 */
export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp';

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const env = getEnv();
    if (!env.SMTP_HOST || !env.SMTP_PORT) {
      return { delivered: false, skipped: false, error: 'SMTP is not configured.' };
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });

    try {
      await transporter.sendMail({
        from: `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return { delivered: true };
    } catch {
      // Never surface the raw driver error — it can embed connection
      // strings or auth details depending on the SMTP client.
      return { delivered: false, skipped: false, error: 'SMTP send failed.' };
    }
  }
}
