import { createHash, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import type { Notifier } from '../ports.js';

export interface StaffSession {
  email: string;
  role: 'owner' | 'staff';
}

const LOGIN_TOKEN_MINUTES = 15;
const SESSION_HOURS = 12;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

/**
 * Passwordless admin login. A single-use link is emailed to allow-listed addresses only;
 * the response is the same for every address so the allow-list cannot be probed.
 */
export class AuthService {
  constructor(
    private readonly db: Pool,
    private readonly notifier: Notifier,
    private readonly options: { allowList: string[]; dashboardUrl: string },
  ) {}

  private async isAdmin(email: string): Promise<boolean> {
    if (this.options.allowList.includes(email)) return true;
    const { rowCount } = await this.db.query('SELECT 1 FROM admins WHERE email = $1', [email]);
    return (rowCount ?? 0) > 0;
  }

  async requestLink(rawEmail: string): Promise<void> {
    const email = rawEmail.trim().toLowerCase();
    if (!(await this.isAdmin(email))) return;
    const token = newToken();
    await this.db.query(
      `INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [hashToken(token), email, LOGIN_TOKEN_MINUTES],
    );
    const link = `${this.options.dashboardUrl}/login/verify?token=${token}`;
    await this.notifier.send({
      template: 'admin_login_link',
      to: email,
      subject: 'Your SeeServe dashboard sign-in link',
      text: `Sign in to the SeeServe dashboard: ${link}\nThis link works once and expires in ${LOGIN_TOKEN_MINUTES} minutes.`,
      data: { link },
    });
  }

  /** Exchanges a login token for a session token. Returns null for unknown, used or expired links. */
  async verify(token: string): Promise<{ sessionToken: string; session: StaffSession; maxAgeMs: number } | null> {
    const { rows } = await this.db.query<{ email: string }>(
      `UPDATE login_tokens SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING email`,
      [hashToken(token)],
    );
    if (!rows[0]) return null;
    const sessionToken = newToken();
    const session: StaffSession = { email: rows[0].email, role: 'owner' };
    await this.db.query(
      `INSERT INTO sessions (token_hash, email, role, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
      [hashToken(sessionToken), session.email, session.role, SESSION_HOURS],
    );
    return { sessionToken, session, maxAgeMs: SESSION_HOURS * 3_600_000 };
  }

  async session(sessionToken: string): Promise<StaffSession | null> {
    const { rows } = await this.db.query<StaffSession>(
      'SELECT email, role FROM sessions WHERE token_hash = $1 AND expires_at > now()',
      [hashToken(sessionToken)],
    );
    return rows[0] ?? null;
  }

  async logout(sessionToken: string): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(sessionToken)]);
  }
}
