import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';
import { HubError } from '../../application/hub/hub-service.js';
import type { StaffSession } from '../../application/auth/auth-service.js';
import { container } from '../../container.js';
import { env } from '../../config/env.js';

export const SESSION_COOKIE = 'ss_session';

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export interface StaffRequest extends Request {
  staff?: StaffSession;
}

/** Accepts the dashboard session cookie, or the MCP_HTTP_TOKEN bearer token for machine clients. */
export async function resolveStaff(req: Request): Promise<StaffSession | null> {
  const bearer = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer && env.MCP_HTTP_TOKEN && bearer === env.MCP_HTTP_TOKEN) return { email: 'mcp-client', role: 'owner' };
  const cookie = readCookie(req, SESSION_COOKIE);
  return cookie ? container.auth.session(cookie) : null;
}

export async function requireStaff(req: StaffRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const staff = await resolveStaff(req);
    if (!staff) {
      res.status(401).json({ error: 'Sign in required' });
      return;
    }
    req.staff = staff;
    next();
  } catch (error) {
    next(error);
  }
}

/** Small fixed-window limiter per IP and route group; enough for a single-instance demo. */
export function rateLimit(name: string, limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({ error: 'Too many requests. Please slow down.' });
      return;
    }
    next();
  };
}

export function parseBody<T>(schema: ZodType<T>, req: Request, res: Response): T | null {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) });
    return null;
  }
  return parsed.data;
}

const DB_UNAVAILABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', '3D000', '28P01', '42P01', '57P03']);

/** Wraps async handlers: user-facing errors keep their message, database outages become 503. */
export function handle(fn: (req: StaffRequest, res: Response) => Promise<void>) {
  return async (req: StaffRequest, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (error) {
      if (error instanceof HubError) {
        res.status(error.status).json({ error: error.message });
        return;
      }
      const code = (error as { code?: string }).code;
      if (code && DB_UNAVAILABLE_CODES.has(code)) {
        res.status(503).json({ error: 'Database unavailable. Run `npm run db:up` and `npm run db:seed`.' });
        return;
      }
      next(error);
    }
  };
}
