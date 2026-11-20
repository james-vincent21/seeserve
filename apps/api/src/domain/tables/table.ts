export type TableStatus = 'vacant' | 'seated' | 'eating' | 'finished' | 'away';

export interface Table {
  id: string;
  label: string;
  status: TableStatus;
  seatedAt: string | null;
}

export interface TableRepository {
  list(): Promise<Table[]>;
}
