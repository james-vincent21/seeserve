import type { Request, Response } from 'express';
import { z } from 'zod';
import { DemoSessionService } from '../../../application/demo/demo-session.service.js';
import { env } from '../../../config/env.js';
import { MockInferenceProvider } from '../../../infrastructure/inference/mock.provider.js';
import { YoloV8HttpProvider } from '../../../infrastructure/inference/yolov8-http.provider.js';
import { pool } from '../../../infrastructure/database/pool.js';
import { PostgresDemoEventRepository } from '../../../infrastructure/repositories/postgres-demo-event.repository.js';

const provider = env.INFERENCE_MODE === 'http' ? new YoloV8HttpProvider() : new MockInferenceProvider();
const demo = new DemoSessionService(provider);
const eventRepository = new PostgresDemoEventRepository(pool);

const frameSchema = z.object({
  // Raw base64 JPEG (no data URL prefix), kept only for this request.
  image: z.string().min(100).max(3_000_000),
  videoTimeSeconds: z.number().finite().nonnegative(),
});
const staffVisitSchema = z.object({ videoTimeSeconds: z.number().finite().nonnegative() });

export function getDemoStateController(_req: Request, res: Response): void {
  res.json({ data: demo.snapshot() });
}

export function resetDemoController(_req: Request, res: Response): void {
  res.json({ data: demo.reset() });
}

export async function analyzeFrameController(req: Request, res: Response): Promise<void> {
  const parsed = frameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid frame request', details: parsed.error.flatten() });
    return;
  }
  try {
    const before = new Set(demo.snapshot().alerts.map((alert) => alert.id));
    const snapshot = await demo.analyze(parsed.data.image, parsed.data.videoTimeSeconds);
    const newAlerts = snapshot.alerts.filter((alert) => !before.has(alert.id));
    for (const alert of newAlerts) await eventRepository.record(alert);
    res.json({ data: snapshot });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Frame analysis failed';
    const status = message.includes('frame limit') ? 429 : 502;
    res.status(status).json({ error: message });
  }
}

export async function listDemoEventsController(_req: Request, res: Response): Promise<void> {
  const data = await eventRepository.recent(10);
  res.json({ data });
}

export async function staffVisitController(req: Request, res: Response): Promise<void> {
  const parsed = staffVisitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid staff visit request' });
    return;
  }
  const tableId = req.params.tableId;
  try {
    demo.recordStaffVisit(tableId, parsed.data.videoTimeSeconds);
    await eventRepository.recordStaffVisit(tableId, parsed.data.videoTimeSeconds);
    res.json({ data: demo.snapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not record staff visit';
    res.status(message === 'Unknown table' ? 404 : 500).json({ error: message });
  }
}
