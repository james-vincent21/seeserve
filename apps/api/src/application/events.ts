import { EventEmitter } from 'node:events';

/** Real-time hub events pushed to the dashboard over Server-Sent Events. Payloads hold no guest emails. */
export type HubEvent =
  | { type: 'queue.updated'; branchId: string }
  | { type: 'reservation.created'; branchId: string; code: string; partySize: number; reservedFor: string }
  | { type: 'reservation.updated'; branchId: string; code: string; status: string }
  | { type: 'floor.updated'; branchId: string };

class HubEvents extends EventEmitter {
  publish(event: HubEvent): void {
    this.emit('event', event);
  }
  subscribe(listener: (event: HubEvent) => void): () => void {
    this.on('event', listener);
    return () => this.off('event', listener);
  }
}

export const hubEvents = new HubEvents();
hubEvents.setMaxListeners(100);
