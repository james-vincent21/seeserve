import type { TableStatus } from '../tables/table.js';
import type { Detection } from '../vision/detection.js';

export type DemoMode = 'standard' | 'iftar';

/** Fields the pure table-state rule reads and writes. Times are clip-relative seconds. */
export interface TableRuleState {
  id: string;
  label: string;
  status: TableStatus;
  seatedAt: number | null;
  pendingStatus: TableStatus | null;
  pendingSince: number | null;
  unattendedAlerted: boolean;
  staffVisitedAt: number | null;
}

export interface DemoTable extends TableRuleState {
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
  /** Clip time when staff acknowledged the table; null while the alert is active. */
  resolvedAt: number | null;
}

export interface FocusedDetection extends Detection {
  tableId: string | null;
  seatId: string | null;
}

export interface DemoSnapshot {
  tables: DemoTable[];
  /** Active (unresolved) alerts, newest last. */
  alerts: DemoAlert[];
  resolvedAlertCount: number;
  analyzedFrames: number;
  maxFrames: number;
  mode: DemoMode;
  /** Unattended threshold currently in force (already multiplied for Iftar mode). */
  unattendedSeconds: number;
  debounceSeconds: number;
  inferenceMode: 'mock' | 'ultralytics' | 'http';
  detections: FocusedDetection[];
}
