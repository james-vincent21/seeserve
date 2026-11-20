import { env } from '../../config/env.js';
import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Adapter for the Ultralytics Platform shared model inference REST API. */
export class UltralyticsApiProvider implements InferenceProvider {
  async detect(jpegBase64: string): Promise<Detection[]> {
    const modelPath = [env.ULTRALYTICS_MODEL_OWNER, env.ULTRALYTICS_MODEL_PROJECT, env.ULTRALYTICS_MODEL_NAME]
      .map(encodeURIComponent).join('/');
    const url = `https://platform.ultralytics.com/api/models/${modelPath}/predict`;
    const imageBytes = Buffer.from(jpegBase64, 'base64');
    if (!imageBytes.length) throw new Error('Sampled frame was empty');

    const body = new FormData();
    body.append('file', new Blob([imageBytes], { type: 'image/jpeg' }), 'frame.jpg');
    body.append('conf', '0.25');
    body.append('iou', '0.5');
    body.append('imgsz', '640');
    body.append('normalize', 'true');
    const headers = new Headers();
    if (env.ULTRALYTICS_API_KEY) headers.set('Authorization', `Bearer ${env.ULTRALYTICS_API_KEY}`);

    const response = await fetch(url, {
      method: 'POST', headers, body, signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      // Do not forward the provider body: it may contain request details.
      throw new Error(`Ultralytics inference returned HTTP ${response.status}`);
    }
    return this.normalize(await response.json());
  }

  private normalize(payload: unknown): Detection[] {
    if (!isRecord(payload) || !Array.isArray(payload.images) || !isRecord(payload.images[0])) return [];
    const image = payload.images[0];
    if (!Array.isArray(image.results)) return [];
    const shape = Array.isArray(image.shape) ? image.shape : [];
    const height = asNumber(shape[0]) ?? 1;
    const width = asNumber(shape[1]) ?? 1;
    return image.results.flatMap((item): Detection[] => {
      if (!isRecord(item) || !isRecord(item.box)) return [];
      const box = item.box;
      const x1 = asNumber(box.x1);
      const y1 = asNumber(box.y1);
      const x2 = asNumber(box.x2);
      const y2 = asNumber(box.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return [];
      const normalized = Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) <= 1.001;
      return [{
        label: String(item.name ?? item.class ?? 'unknown'),
        confidence: asNumber(item.confidence) ?? 0,
        x1: Math.max(0, Math.min(1, normalized ? x1 : x1 / width)),
        y1: Math.max(0, Math.min(1, normalized ? y1 : y1 / height)),
        x2: Math.max(0, Math.min(1, normalized ? x2 : x2 / width)),
        y2: Math.max(0, Math.min(1, normalized ? y2 : y2 / height)),
      }];
    });
  }
}
