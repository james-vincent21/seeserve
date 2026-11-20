// Client for the SeeServe hub API (proxied same-origin through /api/hub).
export async function hub<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const response = await fetch(`/api/hub/v1${path}`, {
    cache: 'no-store',
    ...rest,
    headers: json !== undefined ? { 'content-type': 'application/json' } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string; details?: string[] };
  if (!response.ok) throw new Error(body.details?.join('; ') || body.error || 'Something went wrong. Please try again.');
  return body.data as T;
}

export interface Branch { id: string; name: string; address: string; lat: number; lng: number; phone: string | null; openingHours: Record<string, string> }
export interface MenuItem { id: string; name: string; category: string; description: string; price: number; tags: string[] }
export interface PublicReservation { code: string; branchName: string; guestName: string; partySize: number; reservedForLocal: string; status: string }
export interface QueueTicket { code: string; branchName: string; guestName: string; partySize: number; status: string; position: number | null; partiesAhead: number | null; estimatedWaitMinutes: number | null; estimateSource: string }

export const bdt = (value: number) => `৳${Math.round(value).toLocaleString('en-US')}`;
export const shortBranch = (name: string) => name.replace('Dhaka Table House · ', '');
