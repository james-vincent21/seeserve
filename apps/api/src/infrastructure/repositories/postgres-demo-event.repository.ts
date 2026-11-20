import type { Pool } from 'pg';
import type { DemoEventRecorder } from '../../application/demo/demo-session.js';
import type { DemoAlert, DemoMode } from '../../domain/demo/demo-types.js';

/** Persists demo alerts and staff visits as event metadata only (no images, no identities). */
export class PostgresDemoEventRepository implements DemoEventRecorder {
  constructor(private readonly db: Pool) {}

  async record(alert: DemoAlert, mode: DemoMode): Promise<void> {
    await this.db.query(
      `INSERT INTO table_events (table_id, event_type, occurred_at, duration_seconds, mode, metadata)
       VALUES ($1, $2, now(), NULL, $3, $4::jsonb)`,
      [alert.tableId, alert.type, mode, JSON.stringify({ message: alert.message, videoTimeSeconds: alert.occurredAt })],
    );
  }

  async recordStaffVisit(tableId: string, videoTimeSeconds: number, mode: DemoMode): Promise<void> {
    await this.db.query(
      `INSERT INTO table_events (table_id, event_type, occurred_at, duration_seconds, mode, metadata)
       VALUES ($1, 'staff_visit', now(), NULL, $2, $3::jsonb)`,
      [tableId, mode, JSON.stringify({ videoTimeSeconds })],
    );
  }
}
