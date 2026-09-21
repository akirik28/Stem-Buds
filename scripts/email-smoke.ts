import './load-env';
import nodemailer from 'nodemailer';
import { getEnv } from '../src/server/env';
import { SmtpProvider } from '../src/server/email/smtp-provider';

/**
 * Proves that e-mail actually leaves the building.
 *
 * The scheduled job only mails when there is something to mail, so a clean
 * job run says nothing about whether the SMTP credentials work. This sends
 * one message to the platform's own address and reports the outcome.
 *
 * `SmtpProvider` deliberately swallows the driver error so nothing sensitive
 * can reach a response, so this also runs nodemailer's own `verify()` first
 * — that is the step that distinguishes "wrong password" from "wrong host".
 * Only the error code is printed, never a credential.
 */
async function main() {
  const env = getEnv();
  console.log(`transport : ${env.EMAIL_TRANSPORT}`);
  console.log(`host      : ${env.SMTP_HOST}:${env.SMTP_PORT} (secure=${env.SMTP_SECURE})`);
  console.log(`from      : ${env.EMAIL_FROM_ADDRESS}`);
  console.log(`auth user : ${env.SMTP_USER ? 'set' : 'MISSING'}`);
  console.log(`auth pass : ${env.SMTP_PASSWORD ? 'set' : 'MISSING'}`);

  if (env.EMAIL_TRANSPORT !== 'smtp') {
    console.log('\nEMAIL_TRANSPORT is not "smtp" — nothing would be sent. Stopping.');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });

  try {
    await transporter.verify();
    console.log('\nverify    : OK — the server accepted the credentials.');
  } catch (error) {
    const e = error as { code?: string; responseCode?: number };
    console.log(`\nverify    : FAILED (code=${e.code ?? '?'} responseCode=${e.responseCode ?? '?'})`);
    process.exitCode = 1;
    return;
  }

  const to = env.EMAIL_FROM_ADDRESS;
  const result = await new SmtpProvider().send({
    to,
    subject: 'STEM & BUDS — e-posta gönderim testi',
    text: 'Bu bir test mesajıdır. Bu mesajı aldıysanız platform e-posta gönderebiliyor demektir.',
  });

  console.log(`send      : ${result.delivered ? `DELIVERED to ${to}` : JSON.stringify(result)}`);
  if (!result.delivered) process.exitCode = 1;
}

main();
