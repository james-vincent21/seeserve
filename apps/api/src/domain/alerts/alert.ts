export type AlertType = 'unattended' | 'hand_raise' | 'overstay';

export interface AlertEvent {
  id: string;
  tableId: string;
  type: AlertType;
  occurredAt: string;
  message: string;
}

export interface AlertRepository {
  listRecent(limit: number): Promise<AlertEvent[]>;
  create(event: Omit<AlertEvent, 'id'>): Promise<AlertEvent>;
}
