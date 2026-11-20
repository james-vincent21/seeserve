import type { HubRepository } from '../../infrastructure/repositories/hub.repository.js';
import type { Actor, QueueTicket, Reservation, TurnTimeStats } from '../../domain/hub/types.js';
import { defaultTurnMinutes, estimateWait, RESERVATION_HOLD_MINUTES, type TableAvailability } from '../../domain/queue/wait-estimate.js';
import { generateCode, maskEmail, normalizeCode, reservationProblemMessage, validateReservation } from '../../domain/reservations/rules.js';
import { hubEvents } from '../events.js';
import type { Notifier } from '../ports.js';

export type HubStore = Pick<HubRepository, keyof HubRepository>;

/** A user-facing error whose message is safe to show to guests and to the chatbot. */
export class HubError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
  }
}

const DHAKA_OFFSET_MS = 6 * 3_600_000;
const formatDhaka = (iso: string) =>
  new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 16) + ' (Dhaka)';

export interface PublicReservation {
  code: string;
  branchId: string;
  branchName: string;
  guestName: string;
  partySize: number;
  reservedFor: string;
  reservedForLocal: string;
  status: Reservation['status'];
}

export interface TicketStatusView {
  code: string;
  branchId: string;
  branchName: string;
  guestName: string;
  partySize: number;
  status: QueueTicket['status'];
  position: number | null;
  partiesAhead: number | null;
  estimatedWaitMinutes: number | null;
  estimateSource: TurnTimeStats['source'];
  tableId: string | null;
}

/** Use cases shared by the REST API, the chatbots and the MCP servers. */
export class HubService {
  constructor(
    private readonly store: HubStore,
    private readonly notifier: Notifier,
    private readonly links: { landingUrl: string; now?: () => Date },
  ) {}

  private now(): Date {
    return this.links.now?.() ?? new Date();
  }

  async branches() {
    return this.store.branches();
  }

  async menu(filter: { query?: string; category?: string; tag?: string } = {}) {
    return this.store.menu(filter);
  }

  private async branchName(branchId: string): Promise<string> {
    const branch = (await this.store.branches()).find((item) => item.id === branchId);
    if (!branch) throw new HubError(`Unknown branch "${branchId}".`, 404);
    return branch.name;
  }

  private async toPublic(reservation: Reservation): Promise<PublicReservation> {
    return {
      code: reservation.code,
      branchId: reservation.branchId,
      branchName: await this.branchName(reservation.branchId),
      guestName: reservation.guestName,
      partySize: reservation.partySize,
      reservedFor: reservation.reservedFor,
      reservedForLocal: formatDhaka(reservation.reservedFor),
      status: reservation.status,
    };
  }

  async createReservation(
    input: { branchId: string; guestName: string; guestEmail: string; partySize: number; reservedFor: string; notes?: string },
    actor: Actor,
  ): Promise<{ reservation: PublicReservation; emailSent: boolean }> {
    const branchName = await this.branchName(input.branchId);
    const reservedFor = new Date(input.reservedFor);
    if (Number.isNaN(reservedFor.getTime())) throw new HubError('The reservation time is not a valid date.');
    const floor = await this.store.floor(input.branchId);
    const problem = validateReservation({
      reservedFor,
      partySize: input.partySize,
      now: this.now(),
      maxTableCapacity: Math.max(0, ...floor.map((table) => table.capacity)),
    });
    if (problem) throw new HubError(reservationProblemMessage[problem]);

    let created: Reservation | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt += 1) {
      try {
        created = await this.store.createReservation({
          code: generateCode('R'),
          branchId: input.branchId,
          guestName: input.guestName.trim(),
          guestEmail: input.guestEmail.trim().toLowerCase(),
          partySize: input.partySize,
          reservedFor: reservedFor.toISOString(),
          source: actor.channel,
          notes: input.notes?.trim() ?? '',
        });
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error; // retry only on a duplicate code
      }
    }
    if (!created) throw new HubError('Could not create a reservation code. Please try again.', 500);

    const view = await this.toPublic(created);
    const sent = await this.notifier.send({
      template: 'reservation_confirmed',
      to: created.guestEmail,
      subject: `Your table at ${branchName} — ticket ${created.code}`,
      text: `Hi ${created.guestName}, your table for ${created.partySize} at ${branchName} is booked for ${view.reservedForLocal}. `
        + `Your ticket number is ${created.code}. Check or cancel it at ${this.links.landingUrl}/ticket/${created.code}`,
      data: { ...view, ticketUrl: `${this.links.landingUrl}/ticket/${created.code}` },
    }).catch(() => ({ delivered: false, channel: 'error' }));
    await this.store.audit(actor, 'reservation.create', created.code, { branchId: created.branchId, partySize: created.partySize, email: maskEmail(created.guestEmail) });
    hubEvents.publish({ type: 'reservation.created', branchId: created.branchId, code: created.code, partySize: created.partySize, reservedFor: created.reservedFor });
    return { reservation: view, emailSent: sent.delivered };
  }

  async reservationStatus(rawCode: string): Promise<PublicReservation> {
    const reservation = await this.store.reservationByCode(normalizeCode(rawCode));
    if (!reservation) throw new HubError('No reservation found with that ticket number.', 404);
    return this.toPublic(reservation);
  }

  /** Guests must prove ownership with the email used for the booking. */
  async cancelReservation(rawCode: string, email: string, actor: Actor): Promise<PublicReservation> {
    const reservation = await this.store.reservationByCode(normalizeCode(rawCode));
    if (!reservation || reservation.guestEmail !== email.trim().toLowerCase()) {
      throw new HubError('No reservation matches that ticket number and email.', 404);
    }
    if (reservation.status !== 'booked') throw new HubError(`This reservation is already ${reservation.status}.`);
    const updated = await this.store.setReservationStatus(reservation.id, 'cancelled');
    await this.store.audit(actor, 'reservation.cancel', reservation.code);
    hubEvents.publish({ type: 'reservation.updated', branchId: reservation.branchId, code: reservation.code, status: 'cancelled' });
    void this.notifier.send({
      template: 'reservation_cancelled',
      to: reservation.guestEmail,
      subject: `Reservation ${reservation.code} cancelled`,
      text: `Hi ${reservation.guestName}, your reservation ${reservation.code} has been cancelled.`,
      data: { code: reservation.code },
    }).catch(() => undefined);
    return this.toPublic(updated ?? reservation);
  }

  async joinQueue(
    input: { branchId: string; guestName: string; guestEmail?: string; partySize: number },
    actor: Actor,
  ): Promise<{ ticket: TicketStatusView; emailSent: boolean }> {
    const branchName = await this.branchName(input.branchId);
    const floor = await this.store.floor(input.branchId);
    if (input.partySize > Math.max(0, ...floor.map((table) => table.capacity))) {
      throw new HubError(reservationProblemMessage.party_too_large);
    }
    let ticket: QueueTicket | null = null;
    for (let attempt = 0; attempt < 3 && !ticket; attempt += 1) {
      try {
        ticket = await this.store.createTicket({
          code: generateCode('Q'),
          branchId: input.branchId,
          guestName: input.guestName.trim(),
          guestEmail: input.guestEmail?.trim().toLowerCase() || null,
          partySize: input.partySize,
          source: actor.channel,
        });
      } catch (error) {
        if ((error as { code?: string }).code !== '23505') throw error;
      }
    }
    if (!ticket) throw new HubError('Could not create a queue ticket. Please try again.', 500);
    await this.store.audit(actor, 'queue.join', ticket.code, { branchId: ticket.branchId, partySize: ticket.partySize });
    hubEvents.publish({ type: 'queue.updated', branchId: ticket.branchId });
    const view = await this.queueStatus(ticket.code);
    let emailSent = false;
    if (ticket.guestEmail) {
      emailSent = (await this.notifier.send({
        template: 'queue_ticket',
        to: ticket.guestEmail,
        subject: `Queue ticket ${ticket.code} at ${branchName}`,
        text: `Hi ${ticket.guestName}, you're number ${view.position} in the queue at ${branchName}. `
          + `Estimated wait: ${view.estimatedWaitMinutes ?? '?'} minutes. Track it at ${this.links.landingUrl}/ticket/${ticket.code}`,
        data: { ...view, ticketUrl: `${this.links.landingUrl}/ticket/${ticket.code}` },
      }).catch(() => ({ delivered: false }))).delivered;
    }
    return { ticket: view, emailSent };
  }

  private turnFunction(stats: TurnTimeStats): (partySize: number) => number {
    return (partySize) => {
      const bucket = partySize <= 2 ? 'small' : partySize <= 4 ? 'medium' : 'large';
      return (stats.source === 'measured' ? stats.byPartySize[bucket] : null) ?? defaultTurnMinutes(partySize);
    };
  }

  /** Builds table availability (current seatings + reservation holds) for the wait simulation. */
  private async availability(branchId: string, turn: (partySize: number) => number): Promise<TableAvailability[]> {
    const now = this.now();
    const floor = await this.store.floor(branchId);
    const tables: TableAvailability[] = floor.map((table) => {
      const elapsed = table.occupiedSince ? (now.getTime() - new Date(table.occupiedSince).getTime()) / 60_000 : 0;
      return {
        id: table.id,
        capacity: table.capacity,
        freeInMinutes: table.occupiedSince ? Math.max(5, turn(table.partySize ?? table.capacity) - elapsed) : 0,
        blocked: [],
      };
    });
    const upcoming = await this.store.upcomingReservations(branchId, new Date(now.getTime() + 4 * 3_600_000));
    for (const reservation of upcoming) {
      const start = (new Date(reservation.reservedFor).getTime() - now.getTime()) / 60_000 - RESERVATION_HOLD_MINUTES;
      const end = start + RESERVATION_HOLD_MINUTES + turn(reservation.partySize);
      const target = tables
        .filter((table) => table.capacity >= reservation.partySize)
        .filter((table) => !table.blocked.some(([s, e]) => start < e && end > s))
        .sort((a, b) => a.capacity - b.capacity)[0];
      target?.blocked.push([Math.max(0, start), end]);
    }
    return tables;
  }

  async queueStatus(rawCode: string): Promise<TicketStatusView> {
    const ticket = await this.store.ticketByCode(normalizeCode(rawCode));
    if (!ticket) throw new HubError('No queue ticket found with that number.', 404);
    const board = await this.queueBoard(ticket.branchId);
    const entry = board.tickets.find((item) => item.code === ticket.code);
    if (!entry) throw new HubError('This ticket is from a previous day.', 410);
    return entry;
  }

  /** Today's queue with live positions and wait estimates; used by staff and guests. */
  async queueBoard(branchId: string): Promise<{ tickets: TicketStatusView[]; turnTimes: TurnTimeStats; counts: Record<QueueTicket['status'], number> }> {
    const branchName = await this.branchName(branchId);
    const [tickets, turnTimes] = await Promise.all([this.store.ticketsToday(branchId), this.store.turnTimes(branchId)]);
    const turn = this.turnFunction(turnTimes);
    const tables = await this.availability(branchId, turn);
    const waiting = tickets.filter((ticket) => ticket.status === 'waiting');
    const counts: Record<QueueTicket['status'], number> = { waiting: 0, seated: 0, served: 0, left: 0, cancelled: 0 };
    for (const ticket of tickets) counts[ticket.status] += 1;

    const views = tickets.map((ticket): TicketStatusView => {
      const index = waiting.findIndex((item) => item.id === ticket.id);
      const estimate = index >= 0
        ? estimateWait({ tables, partiesAhead: waiting.slice(0, index).map((item) => item.partySize), partySize: ticket.partySize, turnMinutes: turn })
        : null;
      return {
        code: ticket.code,
        branchId,
        branchName,
        guestName: ticket.guestName,
        partySize: ticket.partySize,
        status: ticket.status,
        position: index >= 0 ? index + 1 : null,
        partiesAhead: index >= 0 ? index : null,
        estimatedWaitMinutes: estimate?.minutes ?? null,
        estimateSource: turnTimes.source,
        tableId: ticket.tableId,
      };
    });
    return { tickets: views, turnTimes, counts };
  }

  /** Accepts either the database id or the human ticket code (Q-XXXXXX). */
  private async findTicket(idOrCode: string): Promise<QueueTicket | null> {
    return /^q-/i.test(idOrCode.trim())
      ? this.store.ticketByCode(normalizeCode(idOrCode))
      : this.store.ticketById(idOrCode);
  }

  /** Staff: seat a waiting ticket at a table (opens a table session for turn-time tracking). */
  async seatTicket(ticketId: string, tableId: string, actor: Actor) {
    const ticket = await this.findTicket(ticketId);
    if (!ticket || ticket.status !== 'waiting') throw new HubError('Ticket is not waiting.', 409);
    const table = await this.store.tableBranch(tableId);
    if (!table || table.branchId !== ticket.branchId) throw new HubError('That table is not in this branch.', 404);
    await this.store.openTableSession(ticket.branchId, tableId, ticket.partySize);
    const updated = await this.store.updateTicket(ticket.id, 'seated', tableId);
    await this.store.audit(actor, 'queue.seat', ticket.code, { tableId });
    hubEvents.publish({ type: 'queue.updated', branchId: ticket.branchId });
    hubEvents.publish({ type: 'floor.updated', branchId: ticket.branchId });
    return updated;
  }

  async setTicketStatus(ticketId: string, status: 'served' | 'left' | 'cancelled', actor: Actor) {
    const ticket = await this.findTicket(ticketId);
    if (!ticket) throw new HubError('Ticket not found.', 404);
    const updated = await this.store.updateTicket(ticket.id, status);
    await this.store.audit(actor, `queue.${status}`, ticket.code);
    hubEvents.publish({ type: 'queue.updated', branchId: ticket.branchId });
    return updated;
  }

  async vacateTable(tableId: string, actor: Actor) {
    const table = await this.store.tableBranch(tableId);
    if (!table) throw new HubError('Table not found.', 404);
    await this.store.closeTableSession(tableId);
    await this.store.audit(actor, 'table.vacate', tableId);
    hubEvents.publish({ type: 'floor.updated', branchId: table.branchId });
    hubEvents.publish({ type: 'queue.updated', branchId: table.branchId });
  }

  async floor(branchId: string) {
    return this.store.floor(branchId);
  }

  async reservationsForDay(branchId: string, day: string) {
    const start = new Date(new Date(`${day}T00:00:00Z`).getTime() - DHAKA_OFFSET_MS);
    const end = new Date(start.getTime() + 86_400_000);
    return this.store.reservationsForDay(branchId, start, end);
  }

  async setReservationStatus(id: string, status: 'seated' | 'completed' | 'no_show' | 'cancelled', tableId: string | null, actor: Actor) {
    const updated = await this.store.setReservationStatus(id, status, tableId);
    if (!updated) throw new HubError('Reservation not found.', 404);
    if (status === 'seated' && tableId) await this.store.openTableSession(updated.branchId, tableId, updated.partySize);
    await this.store.audit(actor, `reservation.${status}`, updated.code, { tableId });
    hubEvents.publish({ type: 'reservation.updated', branchId: updated.branchId, code: updated.code, status });
    return updated;
  }
}
