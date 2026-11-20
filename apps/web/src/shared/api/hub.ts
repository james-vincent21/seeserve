// Hub API (v1). Requests stay same-origin (/api/backend → Express) so the session cookie is sent.
const BASE = '/api/backend/v1';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(`${BASE}${path}`, {
    cache: 'no-store',
    credentials: 'include',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string; details?: string[] };
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  return body.data as T;
}

export interface Branch { id: string; name: string; address: string; lat: number; lng: number; phone: string | null }
export interface QueueEntry {
  code: string; branchId: string; branchName: string; guestName: string; partySize: number;
  status: 'waiting' | 'seated' | 'served' | 'left' | 'cancelled';
  position: number | null; partiesAhead: number | null; estimatedWaitMinutes: number | null;
  estimateSource: 'measured' | 'default'; tableId: string | null;
}
export interface QueueBoard {
  tickets: QueueEntry[];
  counts: Record<QueueEntry['status'], number>;
  turnTimes: { byPartySize: Record<'small' | 'medium' | 'large', number | null>; samples: number; source: 'measured' | 'default' };
}
export interface Reservation {
  id: string; code: string; guestName: string; partySize: number; reservedFor: string;
  status: 'booked' | 'seated' | 'completed' | 'cancelled' | 'no_show'; tableId: string | null; source: string; notes: string;
}
export interface FloorTable { id: string; label: string; capacity: number; occupiedSince: string | null; partySize: number | null }
export interface StaffSession { email: string; role: 'owner' | 'staff' }

export interface AgentReply {
  conversationId: string;
  reply: string;
  toolCalls: Array<{ name: string; ok: boolean }>;
  blocked: boolean;
  screenedBy: string[];
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
  model: string;
  promptVersion: string;
}

export const formatBdt = (value: number) => `৳${Math.round(value).toLocaleString('en-US')}`;
export const dhakaTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' });
