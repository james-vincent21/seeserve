import type { AlertEvent, AlertRepository } from '../../domain/alerts/alert.js';

export class ListRecentAlerts {
  constructor(private readonly alerts: AlertRepository) {}
  execute(limit = 10): Promise<AlertEvent[]> {
    return this.alerts.listRecent(Math.min(Math.max(limit, 1), 100));
  }
}
