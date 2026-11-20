import type { DemoAlert, TableRuleState } from './demo-types.js';

export interface TableRuleResult<T extends TableRuleState> {
  state: T;
  alert: Omit<DemoAlert, 'id' | 'resolvedAt'> | null;
}

/**
 * Pure table-state rule with debounce hysteresis. All time values are clip-relative seconds.
 * A status change must persist for `debounceSeconds` before it is applied; 0 applies it at once.
 */
export function advanceTableState<T extends TableRuleState>(
  current: T,
  occupied: boolean,
  now: number,
  debounceSeconds: number,
  unattendedSeconds: number,
): TableRuleResult<T> {
  const state = { ...current };
  const nextStatus = occupied ? 'seated' : 'vacant';

  if (nextStatus === state.status) {
    state.pendingStatus = null;
    state.pendingSince = null;
  } else {
    if (state.pendingStatus !== nextStatus) {
      state.pendingStatus = nextStatus;
      state.pendingSince = now;
    }
    if (state.pendingSince !== null && now - state.pendingSince >= debounceSeconds) {
      state.status = nextStatus;
      state.pendingStatus = null;
      state.pendingSince = null;
      state.seatedAt = nextStatus === 'seated' ? now : null;
      state.unattendedAlerted = false;
      state.staffVisitedAt = null;
    }
  }

  const hasStaffVisitSinceSeating = state.staffVisitedAt !== null && state.seatedAt !== null &&
    state.staffVisitedAt >= state.seatedAt;
  if (state.status !== 'seated' || state.seatedAt === null || state.unattendedAlerted ||
      hasStaffVisitSinceSeating || now - state.seatedAt < unattendedSeconds) {
    return { state, alert: null };
  }

  state.unattendedAlerted = true;
  return {
    state,
    alert: {
      tableId: state.id,
      tableLabel: state.label,
      type: 'unattended',
      occurredAt: now,
      message: `${state.label} needs service`,
    },
  };
}

export function markStaffVisit<T extends TableRuleState>(current: T, videoTimeSeconds: number): T {
  return { ...current, staffVisitedAt: videoTimeSeconds };
}

/** Iftar guests arrive early and wait for sunset, so unattended alerts wait ten times longer. */
export function effectiveUnattendedSeconds(baseSeconds: number, mode: 'standard' | 'iftar'): number {
  return mode === 'iftar' ? baseSeconds * 10 : baseSeconds;
}
