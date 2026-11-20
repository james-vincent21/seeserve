import type { Detection, InferenceProvider } from '../../domain/vision/detection.js';
import { env } from '../../config/env.js';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const number = numeric(value);
    if (number !== undefined) return number;
  }
  return undefined;
}

/** Normalize common YOLOv8 REST shapes (Ultralytics-style boxes and Roboflow-style predictions).
 *  Provider-specific request/response differences can be isolated in this adapter.
 */
export function normalizeYoloResponse(payload: unknown): Detection[] {
  const root = isRecord(payload) ? payload : {};
  let rows: unknown[] = [];
  let responseImage: UnknownRecord | undefined;
  if (Array.isArray(root.images) && isRecord(root.images[0])) {
    responseImage = root.images[0];
    if (Array.isArray(responseImage.results)) rows = responseImage.results;
  }
  if (rows.length === 0 && Array.isArray(root.predictions)) rows = root.predictions;
  else if (rows.length === 0 && Array.isArray(root.detections)) rows = root.detections;
  else if (rows.length === 0 && Array.isArray(root.boxes)) rows = root.boxes;
  else if (rows.length === 0 && Array.isArray(root.results)) {
    const first = root.results[0];
    if (isRecord(first) && Array.isArray(first.boxes)) {
      const boxes = first.boxes;
      if (boxes.every(isRecord)) rows = boxes;
      else if (isRecord(boxes) && Array.isArray(boxes.xyxy)) {
        const xyxy = boxes.xyxy as unknown[];
        const classes = Array.isArray(boxes.cls) ? boxes.cls : [];
        const confidences = Array.isArray(boxes.conf) ? boxes.conf : [];
        rows = xyxy.map((box, index) => ({ box, class: classes[index], confidence: confidences[index] }));
      }
    }
  }

  const image = isRecord(root.image) ? root.image : {};
  const shape = responseImage && Array.isArray(responseImage.shape) ? responseImage.shape : [];
  const imageWidth = numeric(image.width) ?? numeric(shape[1]) ?? numeric(root.image_width) ?? 1;
  const imageHeight = numeric(image.height) ?? numeric(shape[0]) ?? numeric(root.image_height) ?? 1;

  return rows.flatMap((item): Detection[] => {
    if (!isRecord(item)) return [];
    const box = isRecord(item.box) ? item.box : item;
    const x1Raw = firstNumber(box.x1, box.left);
    const y1Raw = firstNumber(box.y1, box.top);
    const x2Raw = firstNumber(box.x2, box.right);
    const y2Raw = firstNumber(box.y2, box.bottom);
    let x1 = x1Raw;
    let y1 = y1Raw;
    let x2 = x2Raw;
    let y2 = y2Raw;

    // Roboflow-style center x/y/width/height boxes.
    if ([x1, y1, x2, y2].some((n) => n === undefined)) {
      const cx = numeric(item.x);
      const cy = numeric(item.y);
      const width = numeric(item.width);
      const height = numeric(item.height);
      if (cx === undefined || cy === undefined || width === undefined || height === undefined) return [];
      x1 = cx - width / 2; y1 = cy - height / 2;
      x2 = cx + width / 2; y2 = cy + height / 2;
    }
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return [];

    const alreadyNormalized = Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2)) <= 1.001;
    const scaleX = alreadyNormalized ? 1 : imageWidth;
    const scaleY = alreadyNormalized ? 1 : imageHeight;
    const label = String(item.name ?? item.class_name ?? item.class ?? 'unknown');
    const confidence = numeric(item.confidence) ?? numeric(item.score) ?? 0;
    const keypoints = normalizeKeypoints(item.keypoints, imageWidth, imageHeight);
    return [{
      label,
      confidence,
      x1: Math.max(0, Math.min(1, x1 / scaleX)),
      y1: Math.max(0, Math.min(1, y1 / scaleY)),
      x2: Math.max(0, Math.min(1, x2 / scaleX)),
      y2: Math.max(0, Math.min(1, y2 / scaleY)),
      ...(keypoints ? { keypoints } : {}),
    }];
  });
}

function normalizeKeypoints(
  raw: unknown,
  imageWidth: number,
  imageHeight: number,
): Array<{ x: number; y: number; confidence: number }> | undefined {
  let values: unknown = raw;
  let confidences: unknown[] = [];
  if (isRecord(raw) && !Array.isArray(raw)) {
    values = raw.xy ?? raw.keypoints ?? raw.data;
    confidences = Array.isArray(raw.conf) ? raw.conf : Array.isArray(raw.confidence) ? raw.confidence : [];
  }
  if (!Array.isArray(values)) return undefined;
  const points = values.flatMap((entry, index) => {
    let x: number | undefined;
    let y: number | undefined;
    let confidence = numeric(confidences[index]) ?? 1;
    if (Array.isArray(entry)) {
      x = numeric(entry[0]);
      y = numeric(entry[1]);
      confidence = numeric(entry[2]) ?? confidence;
    } else if (isRecord(entry)) {
      x = numeric(entry.x);
      y = numeric(entry.y);
      confidence = numeric(entry.confidence) ?? numeric(entry.score) ?? confidence;
    }
    if (x === undefined || y === undefined) return [];
    const normalized = Math.abs(x) <= 1.001 && Math.abs(y) <= 1.001;
    return [{
      x: Math.max(0, Math.min(1, x / (normalized ? 1 : imageWidth))),
      y: Math.max(0, Math.min(1, y / (normalized ? 1 : imageHeight))),
      confidence,
    }];
  });
  return points.length ? points : undefined;
}

export class YoloV8HttpProvider implements InferenceProvider {
  async detect(jpegBase64: string): Promise<Detection[]> {
    if (!env.INFERENCE_API_URL) throw new Error('INFERENCE_API_URL is required when INFERENCE_MODE=http');
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (env.INFERENCE_API_KEY) {
      headers[env.INFERENCE_API_AUTH_HEADER] = env.INFERENCE_API_AUTH_SCHEME
        ? `${env.INFERENCE_API_AUTH_SCHEME} ${env.INFERENCE_API_KEY}`
        : env.INFERENCE_API_KEY;
    }
    const response = await fetch(env.INFERENCE_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image: jpegBase64 }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Inference provider returned HTTP ${response.status}`);
    return normalizeYoloResponse(await response.json());
  }
}
