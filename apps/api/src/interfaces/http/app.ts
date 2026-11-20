import cors from 'cors';
import express from 'express';
import { env } from '../../config/env.js';
import { apiRouter } from './routes.js';

export const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: '4mb' }));
app.use('/api', apiRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error', err instanceof Error ? err.message : 'unknown');
  res.status(500).json({ error: 'Internal server error' });
});
