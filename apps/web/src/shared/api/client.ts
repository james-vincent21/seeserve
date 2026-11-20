const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface TableView {
  id: string;
  label: string;
  status: 'vacant' | 'seated' | 'eating' | 'finished' | 'away';
  seatedAt: string | null;
}

export async function getTables(): Promise<TableView[]> {
  const response = await fetch(`${API_URL}/api/tables`, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load tables');
  const body = (await response.json()) as { data: TableView[] };
  return body.data;
}
