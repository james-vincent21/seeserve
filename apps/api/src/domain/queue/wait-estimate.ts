/**
 * Pure wait-time estimate for a walk-in party.
 *
 * Simulates the queue: every waiting party (in ticket order) takes the suitable table that frees
 * up first, then holds it for the expected turn time. Tables with an upcoming reservation are
 * blocked from 15 minutes before the booking until the booking's expected end.
 */
export interface TableAvailability {
  id: string;
  capacity: number;
  /** Minutes from now until the table is expected to be free (0 = free now). */
  freeInMinutes: number;
  /** Reservation blocks as [startMinute, endMinute) relative to now. */
  blocked: Array<[number, number]>;
}

export interface WaitEstimateInput {
  tables: TableAvailability[];
  /** Parties already waiting, in ticket order. */
  partiesAhead: number[];
  partySize: number;
  /** Expected minutes a party of this size occupies a table. */
  turnMinutes: (partySize: number) => number;
}

export interface WaitEstimate {
  minutes: number;
  tableId: string;
}

export const RESERVATION_HOLD_MINUTES = 15;

function earliestStart(table: TableAvailability, from: number, duration: number): number {
  let start = Math.max(from, table.freeInMinutes);
  // Push the start past any reservation block it would overlap; blocks are few, so loop until stable.
  for (let moved = true; moved;) {
    moved = false;
    for (const [blockStart, blockEnd] of table.blocked) {
      if (start < blockEnd && start + duration > blockStart) {
        start = blockEnd;
        moved = true;
      }
    }
  }
  return start;
}

/** Returns null when no table at the branch can seat the party. */
export function estimateWait(input: WaitEstimateInput): WaitEstimate | null {
  const tables = input.tables.map((table) => ({ ...table, blocked: [...table.blocked] }));
  let result: WaitEstimate | null = null;
  for (const [index, partySize] of [...input.partiesAhead, input.partySize].entries()) {
    const duration = input.turnMinutes(partySize);
    const options = tables
      .filter((table) => table.capacity >= partySize)
      .map((table) => ({ table, start: earliestStart(table, 0, duration) }))
      // Prefer the earliest start, then the smallest table that fits so large tables stay free.
      .sort((a, b) => a.start - b.start || a.table.capacity - b.table.capacity);
    const choice = options[0];
    if (!choice) {
      if (index === input.partiesAhead.length) return null;
      continue; // a party ahead that cannot be seated here does not block anyone
    }
    choice.table.freeInMinutes = choice.start + duration;
    if (index === input.partiesAhead.length) result = { minutes: Math.round(choice.start), tableId: choice.table.id };
  }
  return result;
}

/** Turn time grows with party size; measured averages replace this default when enough data exists. */
export function defaultTurnMinutes(partySize: number): number {
  return 45 + 8 * Math.max(0, partySize - 2);
}
