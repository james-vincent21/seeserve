const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface TableView {
  id: string;
  label: string;
  status: 'vacant' | 'seated' | 'eating' | 'finished' | 'away';
  seatedAt: string | null;
}

export async function getTables(): Promise<TableView[]> {
  const response = await fetch(`${API_URL}/api/demo/state`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load tables');
  const body = (await response.json()) as { data: DemoSnapshot };
  return body.data.tables;
}

export interface DemoAlertView {
  id: string;
  tableId: string;
  tableLabel: string;
  type: string;
  occurredAt: number;
  message: string;
}

export interface DemoSnapshot {
  tables: TableView[];
  alerts: DemoAlertView[];
  analyzedFrames: number;
  maxFrames: number;
  inferenceMode: string;
}

export async function getDemoState(): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/api/demo/state`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load demo state');
  const body = (await response.json()) as { data: DemoSnapshot };
  return body.data;
}

export async function resetDemo(): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/api/demo/reset`, { method: 'POST' });
  if (!response.ok) throw new Error('Could not reset demo');
  const body = (await response.json()) as { data: DemoSnapshot };
  return body.data;
}

export async function analyzeFrame(image: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/api/demo/analyze-frame`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ image, videoTimeSeconds }),
  });
  const body = (await response.json()) as { data?: DemoSnapshot; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error ?? 'Frame analysis failed');
  return body.data;
}

export async function registerStaffVisit(tableId: string, videoTimeSeconds: number): Promise<DemoSnapshot> {
  const response = await fetch(`${API_URL}/api/demo/tables/${encodeURIComponent(tableId)}/staff-visit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ videoTimeSeconds }),
  });
  const body = (await response.json()) as { data?: DemoSnapshot; error?: string };
  if (!response.ok || !body.data) throw new Error(body.error ?? 'Could not record staff visit');
  return body.data;
}
