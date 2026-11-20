import type { Request, Response } from 'express';
import { z } from 'zod';
import { DemoSession } from '../../../application/demo/demo-session.js';
import { env } from '../../../config/env.js';
import { MockInferenceProvider } from '../../../infrastructure/inference/mock.provider.js';
import { UltralyticsApiProvider } from '../../../infrastructure/inference/ultralytics-api.provider.js';

const provider = env.INFERENCE_MODE === 'ultralytics' ? new UltralyticsApiProvider() : new MockInferenceProvider();
const demoSession = new DemoSession(provider);

const frameSchema = z.object({
  image: z.string().min(100).max(3_000_000),
  videoTimeSeconds: z.number().finite().nonnegative(),
});
const staffVisitSchema = z.object({ videoTimeSeconds: z.number().finite().nonnegative() });

export function getDemoStateController(_req: Request, res: Response): void {
  res.json({ data: demoSession.snapshot() });
}

export function resetDemoController(_req: Request, res: Response): void {
  res.json({ data: demoSession.reset() });
}

export async function analyzeFrameController(req: Request, res: Response): Promise<void> {
  const parsed = frameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid frame request', details: parsed.error.flatten() });
    return;
  }
  try {
    // The frame is transient and is never logged or persisted.
    res.json({ data: await demoSession.analyzeFrame(parsed.data.image, parsed.data.videoTimeSeconds) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Frame analysis failed';
    const status = message.startsWith('Frame limit') ? 429 : 502;
    res.status(status).json({ error: message });
  }
}

export function staffVisitController(req: Request, res: Response): void {
  const parsed = staffVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid staff visit request' });
    return;
  }
  try {
    const rawTableId = req.params.tableId;
    const tableId = Array.isArray(rawTableId) ? rawTableId[0] : rawTableId;
    if (!tableId) {
      res.status(400).json({ error: 'Table ID is required' });
      return;
    }
    res.json({ data: demoSession.markStaffVisited(tableId, parsed.data.videoTimeSeconds) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not record staff visit';
    res.status(message === 'Unknown table' ? 404 : 500).json({ error: message });
  }
}
