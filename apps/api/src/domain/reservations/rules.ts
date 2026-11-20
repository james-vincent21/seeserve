import { randomInt } from 'node:crypto';

/** Unambiguous alphabet: no 0/O, 1/I/L, so codes can be read out over the phone. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateCode(prefix: 'R' | 'Q', length = 6, nextInt: (max: number) => number = randomInt): string {
  let code = '';
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[nextInt(CODE_ALPHABET.length)];
  return `${prefix}-${code}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export const OPENING_HOUR = 12;
export const LAST_BOOKING_HOUR = 22;
export const MAX_ADVANCE_DAYS = 30;
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export type ReservationProblem =
  | 'in_the_past'
  | 'too_far_ahead'
  | 'outside_opening_hours'
  | 'party_too_large';

/** Validates a booking request. Times are checked in Dhaka local time (UTC+6, no DST). */
export function validateReservation(input: { reservedFor: Date; partySize: number; now: Date; maxTableCapacity: number }): ReservationProblem | null {
  const { reservedFor, partySize, now, maxTableCapacity } = input;
  if (reservedFor.getTime() < now.getTime() + 10 * 60_000) return 'in_the_past';
  if (reservedFor.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 86_400_000) return 'too_far_ahead';
  const local = new Date(reservedFor.getTime() + DHAKA_OFFSET_MS);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < OPENING_HOUR * 60 || minutes > LAST_BOOKING_HOUR * 60) return 'outside_opening_hours';
  if (partySize > maxTableCapacity) return 'party_too_large';
  return null;
}

export const reservationProblemMessage: Record<ReservationProblem, string> = {
  in_the_past: 'Please choose a time at least 10 minutes from now.',
  too_far_ahead: `Bookings open up to ${MAX_ADVANCE_DAYS} days ahead.`,
  outside_opening_hours: `We take bookings between ${OPENING_HOUR}:00 and ${LAST_BOOKING_HOUR}:00 (Dhaka time).`,
  party_too_large: 'That party is larger than our biggest table at this branch. Please call the branch for group bookings.',
};

/** Masks an email for display and logs: "guest@example.com" -> "g***@example.com". */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  return `${user.slice(0, 1)}***@${domain}`;
}
