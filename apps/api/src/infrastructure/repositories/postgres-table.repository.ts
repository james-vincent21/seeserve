import type { Pool } from 'pg';
import type { Table, TableRepository } from '../../domain/tables/table.js';

export class PostgresTableRepository implements TableRepository {
  constructor(private readonly db: Pool) {}

  async list(): Promise<Table[]> {
    const result = await this.db.query<{ id: string; label: string }>(
      'SELECT id, label FROM restaurant_tables ORDER BY id',
    );
    return result.rows.map((row) => ({ id: row.id, label: row.label, status: 'vacant', seatedAt: null }));
  }
}
