import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { advanceTableState, markStaffVisit } from '../apps/api/src/domain/demo/table-rules.js';
import type { DemoTableState } from '../apps/api/src/domain/demo/demo-session.js';

function createInitialState(): DemoTableState {
  return {
    id: 'table-1',
    label: 'Table 1',
    status: 'vacant',
    seatedAt: null,
    pendingStatus: null,
    pendingSince: null,
    unattendedAlerted: false,
    staffVisitedAt: null,
    handRaiseSince: null,
    handRaiseCooldownUntil: 0,
  };
}

describe('Table State Rules', () => {
  it('transitions from vacant to seated with debounce', () => {
    let state = createInitialState();
    const debounceSeconds = 2;
    const unattendedSeconds = 90;

    // At t=0, observation is occupied. Next status is pending.
    let result = advanceTableState(state, true, 0, debounceSeconds, unattendedSeconds);
    assert.equal(result.state.status, 'vacant');
    assert.equal(result.state.pendingStatus, 'seated');
    assert.equal(result.state.pendingSince, 0);

    // At t=1, still pending because debounce (2s) has not passed.
    result = advanceTableState(result.state, true, 1, debounceSeconds, unattendedSeconds);
    assert.equal(result.state.status, 'vacant');
    assert.equal(result.state.pendingStatus, 'seated');

    // At t=2, debounce has passed -> transitions to seated.
    result = advanceTableState(result.state, true, 2, debounceSeconds, unattendedSeconds);
    assert.equal(result.state.status, 'seated');
    assert.equal(result.state.seatedAt, 2);
    assert.equal(result.state.pendingStatus, null);
  });

  it('triggers unattended alert after threshold passes without staff visit', () => {
    let state = createInitialState();
    state.status = 'seated';
    state.seatedAt = 10;
    const unattendedSeconds = 30;

    // At t=25 (15s seated), no alert
    let result = advanceTableState(state, true, 25, 0, unattendedSeconds);
    assert.equal(result.alert, null);
    assert.equal(result.state.unattendedAlerted, false);

    // At t=40 (30s seated), unattended alert fires
    result = advanceTableState(result.state, true, 40, 0, unattendedSeconds);
    assert.notEqual(result.alert, null);
    assert.equal(result.alert?.type, 'unattended');
    assert.equal(result.alert?.tableId, 'table-1');
    assert.equal(result.state.unattendedAlerted, true);

    // Subsequent call does not duplicate alert
    const nextResult = advanceTableState(result.state, true, 45, 0, unattendedSeconds);
    assert.equal(nextResult.alert, null);
  });

  it('suppresses unattended alert if staff visits before threshold', () => {
    let state = createInitialState();
    state.status = 'seated';
    state.seatedAt = 10;
    const unattendedSeconds = 30;

    // Staff visits at t=20
    state = markStaffVisit(state, 20);
    assert.equal(state.staffVisitedAt, 20);

    // At t=45 (35s seated, past 30s threshold), no alert should fire because staff visited
    const result = advanceTableState(state, true, 45, 0, unattendedSeconds);
    assert.equal(result.alert, null);
  });
});
