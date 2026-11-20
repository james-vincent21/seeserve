import type { Pool } from 'pg';
import type { DemoAlert } from '../../domain/demo/demo-session.js';

export class PostgresDemoEventRepository {
  constructor(private readonly db: Pool) {}

  async record(alert: DemoAlert): Promise<void> {
    await this.db.query(
      `INSERT INTO table_events (table_id, event_type, occurred_at, duration_seconds, mode, metadata)
       VALUES ($1, $2, now(), NULL, 'standard', $3::jsonb)`,
      [alert.tableId, alert.type, JSON.stringify({ message: alert.message, videoTimeSeconds: alert.occurredAt })],
    );
  }

  async recordStaffVisit(tableId: string, videoTimeSeconds: number): Promise<void> {
    await this.db.query(
      `INSERT INTO table_events (table_id, event_type, occurred_at, duration_seconds, mode, metadata)
       VALUES ($1, 'staff_visit', now(), NULL, 'standard', $2::jsonb)`,
      [tableId, JSON.stringify({ videoTimeSeconds })],
    );
  }

  async recent(limit = 10): Promise<Array<{ id: string; tableId: string; eventType: string; occurredAt: string }>> {
    const result = await this.db.query<{
      id: string; table_id: string; event_type: string; occurred_at: Date;
    }>(
      'SELECT id, table_id, event_type, occurred_at FROM table_events ORDER BY occurred_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      tableId: row.table_id,
      eventType: row.event_type,
      occurredAt: row.occurred_at.toISOString(),
    }));
  }
}
