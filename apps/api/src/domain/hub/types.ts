export interface Branch {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  phone: string | null;
  openingHours: Record<string, string>;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  prepMinutes: number;
  tags: string[];
  isAvailable: boolean;
}

export type ReservationStatus = 'booked' | 'seated' | 'completed' | 'cancelled' | 'no_show';
export type TicketStatus = 'waiting' | 'seated' | 'served' | 'left' | 'cancelled';
export type Channel = 'web' | 'chat' | 'staff' | 'mcp';

export interface Reservation {
  id: string;
  code: string;
  branchId: string;
  guestName: string;
  guestEmail: string;
  partySize: number;
  reservedFor: string;
  status: ReservationStatus;
  tableId: string | null;
  source: string;
  notes: string;
  createdAt: string;
}

export interface QueueTicket {
  id: string;
  code: string;
  branchId: string;
  guestName: string;
  guestEmail: string | null;
  partySize: number;
  status: TicketStatus;
  tableId: string | null;
  source: string;
  createdAt: string;
  seatedAt: string | null;
  servedAt: string | null;
}

export interface FloorTable {
  id: string;
  label: string;
  capacity: number;
  occupiedSince: string | null;
  sessionId: string | null;
  partySize: number | null;
}

export interface TurnTimeStats {
  /** Average minutes per party size bucket (1-2, 3-4, 5+). */
  byPartySize: Record<'small' | 'medium' | 'large', number | null>;
  samples: number;
  source: 'measured' | 'default';
}

/** Who performed an action: a guest channel or a signed-in staff email. */
export interface Actor {
  kind: 'guest' | 'staff' | 'system';
  id: string;
  channel: Channel;
}
