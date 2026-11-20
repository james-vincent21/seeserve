import type { DemoAlert, DemoTableState } from './demo-session.js';

export interface TableRuleResult {
  state: DemoTableState;
  alert: Omit<DemoAlert, 'id'> | null;
}

/** Pure table-state rule. All time values are clip-relative seconds. */
export function advanceTableState(
  current: DemoTableState,
  occupied: boolean,
  now: number,
  debounceSeconds: number,
  unattendedSeconds: number,
): TableRuleResult {
  const state = { ...current };
  const nextStatus = occupied ? 'seated' : 'vacant';

  if (nextStatus === state.status) {
    state.pendingStatus = null;
    state.pendingSince = null;
  } else if (state.pendingStatus !== nextStatus) {
    state.pendingStatus = nextStatus;
    state.pendingSince = now;
  } else if (state.pendingSince !== null && now - state.pendingSince >= debounceSeconds) {
    state.status = nextStatus;
    state.pendingStatus = null;
    state.pendingSince = null;
    state.seatedAt = nextStatus === 'seated' ? now : null;
    state.unattendedAlerted = false;
    state.staffVisitedAt = null;
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

export function markStaffVisit(current: DemoTableState, videoTimeSeconds: number): DemoTableState {
  return { ...current, staffVisitedAt: videoTimeSeconds };
}
