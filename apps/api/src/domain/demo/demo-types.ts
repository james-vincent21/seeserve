import type { TableStatus } from '../tables/table.js';
import type { Detection } from '../vision/detection.js';

export interface DemoTable {
  id: string;
  label: string;
  status: TableStatus;
  seatedAt: number | null;
  staffVisited: boolean;
  unattendedAlerted: boolean;
  handRaiseSince: number | null;
  handRaiseCooldownUntil: number;
  seats: DemoSeat[];
  zone: Array<[number, number]>;
}

export interface DemoSeat {
  id: string;
  occupied: boolean;
}

export interface DemoAlert {
  id: string;
  tableId: string;
  tableLabel: string;
  type: 'unattended' | 'hand_raise';
  occurredAt: number;
  message: string;
}

export interface FocusedDetection extends Detection {
  tableId: string | null;
  seatId: string | null;
}

export interface DemoSnapshot {
  tables: DemoTable[];
  alerts: DemoAlert[];
  analyzedFrames: number;
  maxFrames: number;
  mode: 'standard' | 'iftar';
  inferenceMode: 'mock' | 'ultralytics' | 'http';
  detections: FocusedDetection[];
}
