import type { Pool } from 'pg';
import type { Actor, Branch, FloorTable, MenuItem, QueueTicket, Reservation, TicketStatus, TurnTimeStats } from '../../domain/hub/types.js';

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

interface ReservationRow {
  id: string; code: string; branch_id: string; guest_name: string; guest_email: string; party_size: number;
  reserved_for: Date; status: Reservation['status']; table_id: string | null; source: string; notes: string; created_at: Date;
}
const toReservation = (row: ReservationRow): Reservation => ({
  id: row.id, code: row.code, branchId: row.branch_id, guestName: row.guest_name, guestEmail: row.guest_email,
  partySize: row.party_size, reservedFor: row.reserved_for.toISOString(), status: row.status, tableId: row.table_id,
  source: row.source, notes: row.notes, createdAt: row.created_at.toISOString(),
});

interface TicketRow {
  id: string; code: string; branch_id: string; guest_name: string; guest_email: string | null; party_size: number;
  status: TicketStatus; table_id: string | null; source: string; created_at: Date; seated_at: Date | null; served_at: Date | null;
}
const toTicket = (row: TicketRow): QueueTicket => ({
  id: row.id, code: row.code, branchId: row.branch_id, guestName: row.guest_name, guestEmail: row.guest_email,
  partySize: row.party_size, status: row.status, tableId: row.table_id, source: row.source,
  createdAt: row.created_at.toISOString(), seatedAt: iso(row.seated_at), servedAt: iso(row.served_at),
});

/** PostgreSQL access for the hub (branches, menu, reservations, queue, floor). */
export class HubRepository {
  constructor(private readonly db: Pool) {}

  async branches(): Promise<Branch[]> {
    const { rows } = await this.db.query('SELECT id, name, address, lat, lng, phone, opening_hours FROM branches ORDER BY id');
    return rows.map((row) => ({ id: row.id, name: row.name, address: row.address, lat: row.lat, lng: row.lng, phone: row.phone, openingHours: row.opening_hours }));
  }

  async menu(filter: { query?: string; category?: string; tag?: string } = {}): Promise<MenuItem[]> {
    const { rows } = await this.db.query(
      `SELECT id, name, category, description, price, prep_minutes, tags, is_available FROM menu_items
       WHERE ($1::text IS NULL OR name ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%' OR category ILIKE '%' || $1 || '%')
         AND ($2::text IS NULL OR category ILIKE $2)
         AND ($3::text IS NULL OR $3 = ANY(tags))
       ORDER BY category, price`,
      [filter.query ?? null, filter.category ?? null, filter.tag ?? null],
    );
    return rows.map((row) => ({ id: row.id, name: row.name, category: row.category, description: row.description, price: Number(row.price), prepMinutes: row.prep_minutes, tags: row.tags, isAvailable: row.is_available }));
  }

  async floor(branchId: string): Promise<FloorTable[]> {
    const { rows } = await this.db.query(
      `SELECT t.id, t.label, t.capacity, s.id AS session_id, s.seated_at, s.party_size
       FROM restaurant_tables t
       LEFT JOIN LATERAL (SELECT id, seated_at, party_size FROM table_sessions ts
         WHERE ts.table_id = t.id AND ts.vacated_at IS NULL ORDER BY seated_at DESC LIMIT 1) s ON true
       WHERE t.branch_id = $1 ORDER BY t.id`,
      [branchId],
    );
    return rows.map((row) => ({ id: row.id, label: row.label, capacity: row.capacity, sessionId: row.session_id, occupiedSince: iso(row.seated_at), partySize: row.party_size ?? null }));
  }

  async turnTimes(branchId: string, minSamples = 20): Promise<TurnTimeStats> {
    const { rows } = await this.db.query(
      `SELECT CASE WHEN party_size <= 2 THEN 'small' WHEN party_size <= 4 THEN 'medium' ELSE 'large' END AS bucket,
              avg(extract(epoch FROM vacated_at - seated_at) / 60)::float AS minutes, count(*)::int AS samples
       FROM table_sessions
       WHERE branch_id = $1 AND vacated_at IS NOT NULL AND seated_at > now() - interval '30 days'
       GROUP BY 1`,
      [branchId],
    );
    const samples = rows.reduce((sum, row) => sum + row.samples, 0);
    const byPartySize: TurnTimeStats['byPartySize'] = { small: null, medium: null, large: null };
    for (const row of rows) byPartySize[row.bucket as keyof typeof byPartySize] = Math.round(row.minutes);
    return { byPartySize, samples, source: samples >= minSamples ? 'measured' : 'default' };
  }

  async createReservation(input: Omit<Reservation, 'id' | 'status' | 'tableId' | 'createdAt'>): Promise<Reservation> {
    const { rows } = await this.db.query<ReservationRow>(
      `INSERT INTO reservations (code, branch_id, guest_name, guest_email, party_size, reserved_for, source, notes, consent_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`,
      [input.code, input.branchId, input.guestName, input.guestEmail, input.partySize, input.reservedFor, input.source, input.notes],
    );
    return toReservation(rows[0]);
  }

  async reservationByCode(code: string): Promise<Reservation | null> {
    const { rows } = await this.db.query<ReservationRow>('SELECT * FROM reservations WHERE code = $1', [code]);
    return rows[0] ? toReservation(rows[0]) : null;
  }

  async reservationsForDay(branchId: string, dayStart: Date, dayEnd: Date): Promise<Reservation[]> {
    const { rows } = await this.db.query<ReservationRow>(
      'SELECT * FROM reservations WHERE branch_id = $1 AND reserved_for >= $2 AND reserved_for < $3 ORDER BY reserved_for',
      [branchId, dayStart, dayEnd],
    );
    return rows.map(toReservation);
  }

  async upcomingReservations(branchId: string, until: Date): Promise<Reservation[]> {
    const { rows } = await this.db.query<ReservationRow>(
      `SELECT * FROM reservations WHERE branch_id = $1 AND status = 'booked' AND reserved_for BETWEEN now() - interval '15 minutes' AND $2
       ORDER BY reserved_for`,
      [branchId, until],
    );
    return rows.map(toReservation);
  }

  async setReservationStatus(id: string, status: Reservation['status'], tableId?: string | null): Promise<Reservation | null> {
    const { rows } = await this.db.query<ReservationRow>(
      `UPDATE reservations SET status = $2, table_id = COALESCE($3, table_id), updated_at = now() WHERE id = $1 RETURNING *`,
      [id, status, tableId ?? null],
    );
    return rows[0] ? toReservation(rows[0]) : null;
  }

  async createTicket(input: Pick<QueueTicket, 'code' | 'branchId' | 'guestName' | 'guestEmail' | 'partySize' | 'source'>): Promise<QueueTicket> {
    const { rows } = await this.db.query<TicketRow>(
      `INSERT INTO queue_tickets (code, branch_id, guest_name, guest_email, party_size, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [input.code, input.branchId, input.guestName, input.guestEmail, input.partySize, input.source],
    );
    return toTicket(rows[0]);
  }

  async ticketByCode(code: string): Promise<QueueTicket | null> {
    const { rows } = await this.db.query<TicketRow>('SELECT * FROM queue_tickets WHERE code = $1', [code]);
    return rows[0] ? toTicket(rows[0]) : null;
  }

  async ticketById(id: string): Promise<QueueTicket | null> {
    const { rows } = await this.db.query<TicketRow>('SELECT * FROM queue_tickets WHERE id = $1', [id]);
    return rows[0] ? toTicket(rows[0]) : null;
  }

  /** Today's tickets for the branch (Dhaka day), oldest first. */
  async ticketsToday(branchId: string): Promise<QueueTicket[]> {
    const { rows } = await this.db.query<TicketRow>(
      `SELECT * FROM queue_tickets WHERE branch_id = $1
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka'
       ORDER BY created_at`,
      [branchId],
    );
    return rows.map(toTicket);
  }

  async updateTicket(id: string, status: TicketStatus, tableId: string | null = null): Promise<QueueTicket | null> {
    const { rows } = await this.db.query<TicketRow>(
      `UPDATE queue_tickets SET status = $2, table_id = COALESCE($3, table_id),
         seated_at = CASE WHEN $2 = 'seated' THEN now() ELSE seated_at END,
         served_at = CASE WHEN $2 = 'served' THEN now() ELSE served_at END
       WHERE id = $1 RETURNING *`,
      [id, status, tableId],
    );
    return rows[0] ? toTicket(rows[0]) : null;
  }

  async openTableSession(branchId: string, tableId: string, partySize: number): Promise<string> {
    const { rows } = await this.db.query(
      `INSERT INTO table_sessions (branch_id, table_id, party_size, seated_at, source) VALUES ($1,$2,$3, now(), 'staff') RETURNING id`,
      [branchId, tableId, partySize],
    );
    return rows[0].id;
  }

  async closeTableSession(tableId: string): Promise<void> {
    await this.db.query('UPDATE table_sessions SET vacated_at = now() WHERE table_id = $1 AND vacated_at IS NULL', [tableId]);
  }

  async tableBranch(tableId: string): Promise<{ branchId: string; capacity: number } | null> {
    const { rows } = await this.db.query('SELECT branch_id, capacity FROM restaurant_tables WHERE id = $1', [tableId]);
    return rows[0] ? { branchId: rows[0].branch_id, capacity: rows[0].capacity } : null;
  }

  async audit(actor: Actor, action: string, target: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
    await this.db.query('INSERT INTO audit_log (actor, action, target, metadata) VALUES ($1,$2,$3,$4)',
      [`${actor.kind}:${actor.channel}:${actor.id}`, action, target, JSON.stringify(metadata)]);
  }
}
