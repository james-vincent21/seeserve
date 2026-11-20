import { Router } from 'express';
import { healthController } from './controllers/health.controller.js';
import { listTablesController } from './controllers/tables.controller.js';

export const apiRouter = Router();
apiRouter.get('/health', healthController);
apiRouter.get('/tables', listTablesController);
