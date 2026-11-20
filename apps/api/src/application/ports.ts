/** Outbound email goes through an adapter (n8n webhook in production, console stub in development). */
export type EmailTemplate = 'reservation_confirmed' | 'reservation_cancelled' | 'queue_ticket' | 'admin_login_link';

export interface EmailMessage {
  template: EmailTemplate;
  to: string;
  subject: string;
  /** Plain-text body; HTML formatting is done by the n8n workflow. */
  text: string;
  data: Record<string, unknown>;
}

export interface Notifier {
  send(message: EmailMessage): Promise<{ delivered: boolean; channel: string }>;
}
