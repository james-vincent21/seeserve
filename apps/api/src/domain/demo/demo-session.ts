import type { TableStatus } from '../tables/table.js';
import type { Detection } from '../vision/detection.js';

export interface Zone {
  id: string;
  label: string;
  polygon: Array<[number, number]>;
}

export interface DemoTableState {
  id: string;
  label: string;
  status: TableStatus;
  seatedAt: number | null;
  pendingStatus: TableStatus | null;
  pendingSince: number | null;
  unattendedAlerted: boolean;
  staffVisitedAt: number | null;
  handRaiseSince: number | null;
  handRaiseCooldownUntil: number;
}

export interface DemoAlert {
  id: string;
  tableId: string;
  tableLabel: string;
  type: 'unattended' | 'hand_raise';
  occurredAt: number;
  message: string;
}

export interface FrameAnalysis {
  videoTimeSeconds: number;
  detections: Detection[];
}

export interface DemoSnapshot {
  tables: DemoTableState[];
  alerts: DemoAlert[];
  analyzedFrames: number;
  maxFrames: number;
  inferenceMode: string;
}

export function pointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function detectionIsPerson(detection: Detection): boolean {
  const label = detection.label.toLowerCase();
  return label === 'person' || label === '0';
}

export function detectionFootPoint(detection: Detection): [number, number] {
  return [(detection.x1 + detection.x2) / 2, detection.y2];
}
