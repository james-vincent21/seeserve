import type { Pool, PoolClient } from 'pg';
import { branches, menu, openingHours, tables } from './catalog.js';
import { generateHistory } from './synthetic.js';

/** Inserts rows column-wise with unnest(), which is far faster than one INSERT per row. */
async function bulkInsert(client: PoolClient, sql: string, columns: unknown[][], batch = 5000): Promise<void> {
  const rows = columns[0]?.length ?? 0;
  for (let start = 0; start < rows; start += batch) {
    await client.query(sql, columns.map((column) => column.slice(start, start + batch)));
  }
}

export interface SeedSummary {
  branches: number;
  tables: number;
  menuItems: number;
  orders: number;
  orderItems: number;
  days: number;
}

/**
 * Replaces all synthetic data with a fresh deterministic history ending today.
 * Real rows (source <> 'synthetic') are never touched.
 */
export async function seedDatabase(db: Pool, options: { days?: number; adminEmails?: string[] } = {}): Promise<SeedSummary> {
  const days = options.days ?? 90;
  const history = generateHistory({ endDay: new Date(), days });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const branch of branches) {
      await client.query(
        `INSERT INTO branches (id, name, address, lat, lng, phone, opening_hours) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, lat = EXCLUDED.lat,
           lng = EXCLUDED.lng, phone = EXCLUDED.phone, opening_hours = EXCLUDED.opening_hours`,
        [branch.id, branch.name, branch.address, branch.lat, branch.lng, branch.phone, JSON.stringify(openingHours)],
      );
    }
    for (const table of tables) {
      await client.query(
        `INSERT INTO restaurant_tables (id, label, branch_id, capacity) VALUES ($1,$2,$3,$4)
         ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, branch_id = EXCLUDED.branch_id, capacity = EXCLUDED.capacity`,
        [table.id, table.label, table.branchId, table.capacity],
      );
    }
    for (const item of menu) {
      await client.query(
        `INSERT INTO menu_items (id, name, category, description, price, cost_price, prep_minutes, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, description = EXCLUDED.description,
           price = EXCLUDED.price, cost_price = EXCLUDED.cost_price, prep_minutes = EXCLUDED.prep_minutes, tags = EXCLUDED.tags`,
        [item.id, item.name, item.category, item.description, item.price, item.cost, item.prep, item.tags],
      );
    }
    for (const email of options.adminEmails ?? []) {
      await client.query('INSERT INTO admins (email) VALUES ($1) ON CONFLICT DO NOTHING', [email.toLowerCase()]);
    }

    await client.query(`DELETE FROM orders WHERE source = 'synthetic'`);
    await client.query(`DELETE FROM table_sessions WHERE source = 'synthetic'`);
    await client.query(`DELETE FROM reservations WHERE source = 'synthetic'`);
    await client.query(`DELETE FROM queue_tickets WHERE source = 'synthetic'`);
    await client.query(`DELETE FROM daily_weather WHERE source = 'synthetic'`);
    await client.query(`DELETE FROM expenses WHERE note = 'synthetic'`);

    const { sessions, orders, items, weather, expenses } = history;
    await bulkInsert(client,
      `INSERT INTO table_sessions (id, branch_id, table_id, party_size, seated_at, vacated_at, source)
       SELECT *, 'synthetic' FROM unnest($1::uuid[], $2::text[], $3::text[], $4::int[], $5::timestamptz[], $6::timestamptz[])`,
      [sessions.map((s) => s.id), sessions.map((s) => s.branchId), sessions.map((s) => s.tableId),
        sessions.map((s) => s.partySize), sessions.map((s) => s.seatedAt), sessions.map((s) => s.vacatedAt)]);
    await bulkInsert(client,
      `INSERT INTO orders (id, branch_id, table_id, table_session_id, covers, total, created_at, paid_at, payment_method, status, source)
       SELECT *, 'paid', 'synthetic' FROM unnest($1::uuid[], $2::text[], $3::text[], $4::uuid[], $5::int[], $6::numeric[],
         $7::timestamptz[], $8::timestamptz[], $9::text[])`,
      [orders.map((o) => o.id), orders.map((o) => o.branchId), orders.map((o) => o.tableId), orders.map((o) => o.sessionId),
        orders.map((o) => o.covers), orders.map((o) => o.total), orders.map((o) => o.createdAt), orders.map((o) => o.paidAt),
        orders.map((o) => o.paymentMethod)]);
    await bulkInsert(client,
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, unit_cost, placed_at, ready_at, served_at)
       SELECT * FROM unnest($1::uuid[], $2::text[], $3::int[], $4::numeric[], $5::numeric[], $6::timestamptz[], $7::timestamptz[], $8::timestamptz[])`,
      [items.map((i) => i.orderId), items.map((i) => i.menuItemId), items.map((i) => i.quantity), items.map((i) => i.unitPrice),
        items.map((i) => i.unitCost), items.map((i) => i.placedAt), items.map((i) => i.readyAt), items.map((i) => i.servedAt)]);
    await bulkInsert(client,
      `INSERT INTO daily_weather (branch_id, day, temp_max_c, precipitation_mm, source)
       SELECT *, 'synthetic' FROM unnest($1::text[], $2::date[], $3::numeric[], $4::numeric[])
       ON CONFLICT (branch_id, day) DO NOTHING`,
      [weather.map((w) => w.branchId), weather.map((w) => w.day), weather.map((w) => w.tempMaxC), weather.map((w) => w.precipitationMm)]);
    await bulkInsert(client,
      `INSERT INTO expenses (branch_id, category, amount, incurred_on, note)
       SELECT *, 'synthetic' FROM unnest($1::text[], $2::text[], $3::numeric[], $4::date[])`,
      [expenses.map((e) => e.branchId), expenses.map((e) => e.category), expenses.map((e) => e.amount), expenses.map((e) => e.incurredOn)]);

    // A few live bookings and walk-ins for today so the queue screens are not empty.
    const now = Date.now();
    const sampleGuests = [['Ayesha R.', 2], ['Tanvir H.', 4], ['Nusrat J.', 3], ['Rafiq M.', 6]] as const;
    for (const [index, [name, party]] of sampleGuests.entries()) {
      await client.query(
        `INSERT INTO reservations (code, branch_id, guest_name, guest_email, party_size, reserved_for, source)
         VALUES ($1, 'gulshan', $2, $3, $4, $5, 'synthetic')`,
        [`R-DEMO${index + 1}`, name, `guest${index + 1}@example.com`, party, new Date(now + (index + 1) * 45 * 60_000)],
      );
    }
    for (const [index, [name, party]] of sampleGuests.slice(0, 3).entries()) {
      await client.query(
        `INSERT INTO queue_tickets (code, branch_id, guest_name, party_size, created_at, source)
         VALUES ($1, 'gulshan', $2, $3, $4, 'synthetic')`,
        [`Q-DEMO${index + 1}`, name, party, new Date(now - (20 - index * 6) * 60_000)],
      );
    }
    await client.query('COMMIT');
    return { branches: branches.length, tables: tables.length, menuItems: menu.length, orders: orders.length, orderItems: items.length, days };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
