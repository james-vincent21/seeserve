import type { Request, Response } from 'express';
import { ListTables } from '../../../application/tables/list-tables.js';
import { PostgresTableRepository } from '../../../infrastructure/repositories/postgres-table.repository.js';
import { pool } from '../../../infrastructure/database/pool.js';

const listTables = new ListTables(new PostgresTableRepository(pool));

export async function listTablesController(_req: Request, res: Response): Promise<void> {
  res.json({ data: await listTables.execute() });
}
