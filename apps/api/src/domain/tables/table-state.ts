import type { TableStatus } from './table.js';

export interface TableObservation {
  occupied: boolean;
  observedAt: number;
}

export interface TableStateSnapshot {
  status: TableStatus;
  changedAt: number;
}

/** Pure business rule: caller supplies time and an already zone-mapped observation. */
export function transitionTableState(
  current: TableStateSnapshot,
  observation: TableObservation,
  debounceMs: number,
): TableStateSnapshot {
  const next: TableStatus = observation.occupied ? 'seated' : 'vacant';
  if (next === current.status || observation.observedAt - current.changedAt < debounceMs) return current;
  return { status: next, changedAt: observation.observedAt };
}
