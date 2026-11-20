import type { EmailMessage, Notifier } from '../../application/ports.js';
import { maskEmail } from '../../domain/reservations/rules.js';

/**
 * Sends email through the n8n "seeserve-email" workflow (infra/n8n/seeserve-email.json),
 * which formats the message and delivers it with the Gmail/SMTP node configured in n8n.
 */
export class N8nNotifier implements Notifier {
  constructor(private readonly baseUrl: string, private readonly secret: string | undefined) {}

  async send(message: EmailMessage) {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/seeserve-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(this.secret ? { 'x-seeserve-secret': this.secret } : {}) },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Email webhook returned HTTP ${response.status}`);
    return { delivered: true, channel: 'n8n' };
  }
}

/**
 * Development stand-in when no webhook is configured. Logs that an email would be sent, with the
 * address masked. Login links are printed only when explicitly allowed (never in production).
 */
export class ConsoleNotifier implements Notifier {
  constructor(private readonly printLoginLinks: boolean) {}

  async send(message: EmailMessage) {
    console.log(`[email:not-sent] ${message.template} to ${maskEmail(message.to)} — set N8N_WEBHOOK_BASE_URL to deliver`);
    if (message.template === 'admin_login_link' && this.printLoginLinks) {
      console.log(`[email:dev-login-link] ${String(message.data.link)}`);
    }
    return { delivered: false, channel: 'console' };
  }
}
