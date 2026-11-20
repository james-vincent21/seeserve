import cors from 'cors';
import express from 'express';
import { env } from '../../config/env.js';
import { apiRouter } from './routes.js';
import { v1Router } from './v1.routes.js';
import { mcpRouter } from '../mcp/http.js';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: [env.WEB_ORIGIN, env.LANDING_ORIGIN], credentials: true }));
app.use(express.json({ limit: '4mb' }));
app.use('/api/v1', v1Router);
app.use('/api', apiRouter);
app.use('/mcp', mcpRouter);
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log the message only: request bodies (frames, chat text, emails) are never logged.
  console.error('Unhandled API error', err instanceof Error ? err.message : 'unknown');
  if (err instanceof Error && err.name === 'ZodError') {
    res.status(400).json({ error: 'Invalid request' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
});
