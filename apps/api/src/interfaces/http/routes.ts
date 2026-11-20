import { Router } from 'express';
import { healthController } from './controllers/health.controller.js';
import { listTablesController } from './controllers/tables.controller.js';
import {
  analyzeFrameController,
  getDemoStateController,
  resetDemoController,
  setModeController,
  staffVisitController,
} from './controllers/demo.controller.js';

export const apiRouter = Router();
apiRouter.get('/health', healthController);
apiRouter.get('/tables', listTablesController);
apiRouter.get('/demo/state', getDemoStateController);
apiRouter.post('/demo/reset', resetDemoController);
apiRouter.post('/demo/mode', setModeController);
apiRouter.post('/demo/analyze-frame', analyzeFrameController);
apiRouter.post('/demo/tables/:tableId/staff-visit', staffVisitController);
