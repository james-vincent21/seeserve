import type { Request, Response } from 'express';
import { pool } from '../../../infrastructure/database/pool.js';

/** The API itself is healthy even without PostgreSQL: the CCTV demo runs in memory. */
export async function healthController(_req: Request, res: Response): Promise<void> {
  let database: 'connected' | 'unavailable' = 'unavailable';
  try {
    await pool.query('SELECT 1');
    database = 'connected';
  } catch {
    // Reported below; database-backed features return 503 on their own routes.
  }
  res.json({ status: 'ok', api: 'ok', database });
}
