// Route through Next.js so browser requests remain same-origin; Next proxies to Express.
const API_URL = '/api/backend';

export interface TableView {
  id: string;
  label: string;
  status: 'vacant' | 'seated' | 'eating' | 'finished' | 'away';
  seatedAt: number | null;
  seats: Array<{ id: string; occupied: boolean }>;
  zone: Array<[number, number]>;
}

export interface FocusedDetectionView {
  label: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tableId: string | null;
  seatId: string | null;
}

export interface DemoAlertView {
  id: string;
  tableId: string;
  tableLabel: string;
  type: 'unattended' | 'hand_raise';
  occurredAt: number;
  message: string;
}

export interface DemoSnapshot {
  tables: TableView[];
  alerts: DemoAlertView[];
  analyzedFrames: number;
  maxFrames: number;
  mode: 'standard' | 'iftar';
  inferenceMode: string;
  detections: FocusedDetectionView[];
}

async function readSnapshot(response: Response): Promise<DemoSnapshot> {
  const body = (await response.json()) as { data?: DemoSnapshot; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error ?? 'The demo API request failed');
  return body.data;
}

export async function getDemoState(): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/demo/state`, { cache: 'no-store' });
  return readSnapshot(response);
}

export async function resetDemo(): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/demo/reset`, { method: 'POST' });
  return readSnapshot(response);
}

export async function setDemoMode(mode: 'standard' | 'iftar'): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/demo/mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
  return readSnapshot(response);
}

export async function analyzeFrame(image: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/demo/analyze-frame`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image, videoTimeSeconds }),
  });
  return readSnapshot(response);
}

export async function registerStaffVisit(tableId: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/demo/tables/${encodeURIComponent(tableId)}/staff-visit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ videoTimeSeconds }),
  });
  return readSnapshot(response);
}
