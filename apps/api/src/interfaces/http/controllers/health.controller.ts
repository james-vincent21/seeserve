import type { Request, Response } from 'express';
import { pool } from '../../../infrastructure/database/pool.js';

export async function healthController(_req: Request, res: Response): Promise<void> {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
}
