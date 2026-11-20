import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultTurnMinutes, estimateWait, type TableAvailability } from '../apps/api/src/domain/queue/wait-estimate.js';
import { generateCode, maskEmail, normalizeCode, validateReservation } from '../apps/api/src/domain/reservations/rules.js';

const turn = () => 60;
const table = (id: string, capacity: number, freeInMinutes = 0, blocked: Array<[number, number]> = []): TableAvailability =>
  ({ id, capacity, freeInMinutes, blocked });

describe('Wait estimate', () => {
  it('seats a party immediately when a suitable table is free', () => {
    const estimate = estimateWait({ tables: [table('t1', 4)], partiesAhead: [], partySize: 2, turnMinutes: turn });
    assert.deepEqual(estimate, { minutes: 0, tableId: 't1' });
  });

  it('waits for the earliest suitable table and respects parties ahead', () => {
    const estimate = estimateWait({
      tables: [table('t1', 4, 20), table('t2', 4, 35)],
      partiesAhead: [3],
      partySize: 2,
      turnMinutes: turn,
    });
    // The party ahead takes t1 at minute 20; we get t2 at minute 35.
    assert.deepEqual(estimate, { minutes: 35, tableId: 't2' });
  });

  it('prefers the smallest table that fits', () => {
    const estimate = estimateWait({ tables: [table('big', 6), table('small', 2)], partiesAhead: [], partySize: 2, turnMinutes: turn });
    assert.equal(estimate?.tableId, 'small');
  });

  it('does not seat a walk-in into a reservation hold', () => {
    // Booking at minute 30 is held from minute 15; a 60-minute walk-in would overlap it.
    const estimate = estimateWait({ tables: [table('t1', 4, 0, [[15, 90]])], partiesAhead: [], partySize: 2, turnMinutes: turn });
    assert.equal(estimate?.minutes, 90);
  });

  it('returns null when no table can seat the party', () => {
    assert.equal(estimateWait({ tables: [table('t1', 4)], partiesAhead: [], partySize: 8, turnMinutes: turn }), null);
  });

  it('grows the default turn time with party size', () => {
    assert.ok(defaultTurnMinutes(6) > defaultTurnMinutes(2));
  });
});

describe('Reservation rules', () => {
  const now = new Date('2026-11-21T06:00:00Z'); // 12:00 in Dhaka

  it('accepts a dinner booking tonight', () => {
    const reservedFor = new Date('2026-11-21T14:00:00Z'); // 20:00 Dhaka
    assert.equal(validateReservation({ reservedFor, partySize: 4, now, maxTableCapacity: 6 }), null);
  });

  it('rejects times outside opening hours, in the past, too far ahead, or too large', () => {
    assert.equal(validateReservation({ reservedFor: new Date('2026-11-21T20:00:00Z'), partySize: 2, now, maxTableCapacity: 6 }), 'outside_opening_hours');
    assert.equal(validateReservation({ reservedFor: new Date('2026-11-21T06:05:00Z'), partySize: 2, now, maxTableCapacity: 6 }), 'in_the_past');
    assert.equal(validateReservation({ reservedFor: new Date('2027-01-21T14:00:00Z'), partySize: 2, now, maxTableCapacity: 6 }), 'too_far_ahead');
    assert.equal(validateReservation({ reservedFor: new Date('2026-11-21T14:00:00Z'), partySize: 9, now, maxTableCapacity: 6 }), 'party_too_large');
  });

  it('generates readable codes and normalizes user input', () => {
    const code = generateCode('R', 6, () => 0);
    assert.equal(code, 'R-AAAAAA');
    assert.match(generateCode('Q'), /^Q-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(normalizeCode(' r-ab cd12 '), 'R-ABCD12');
  });

  it('masks emails for logs and displays', () => {
    assert.equal(maskEmail('guest@example.com'), 'g***@example.com');
  });
});
