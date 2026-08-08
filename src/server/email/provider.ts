export type EmailMessage = {
  to: string;
  subject: string;
  /** Plain text only — the platform never sends HTML email. */
  text: string;
};

export type EmailSendResult =
  | { delivered: true }
  | { delivered: false; skipped: true }
  | { delivered: false; skipped: false; error: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}
