import type { Pool } from 'pg';

/** Read-only business analytics. Every number the owner assistant reports comes from these queries. */
const DAY = `(o.created_at AT TIME ZONE 'Asia/Dhaka')::date`;
const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

export interface PeriodFilter {
  branchId?: string | null;
  /** Inclusive window ending today (Dhaka). */
  days: number;
}

export class AnalyticsRepository {
  constructor(private readonly db: Pool) {}

  async dailySeries(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `SELECT ${DAY}::text AS day, sum(o.total) AS revenue, count(*)::int AS orders, sum(o.covers)::int AS covers
       FROM orders o
       WHERE o.status <> 'cancelled' AND ($1::text IS NULL OR o.branch_id = $1)
         AND ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int
       GROUP BY 1 ORDER BY 1`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ day: row.day, revenue: num(row.revenue), orders: row.orders, covers: row.covers }));
  }

  /** Current window vs the previous window of the same length. */
  async summary(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `WITH windows AS (
         SELECT CASE WHEN ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int THEN 'current' ELSE 'previous' END AS window,
                o.total, o.covers, o.branch_id
         FROM orders o
         WHERE o.status <> 'cancelled' AND ($1::text IS NULL OR o.branch_id = $1)
           AND ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - 2 * $2::int)
       SELECT window, sum(total) AS revenue, count(*)::int AS orders, sum(covers)::int AS covers FROM windows GROUP BY window`,
      [filter.branchId ?? null, filter.days],
    );
    const pick = (window: string) => rows.find((row) => row.window === window) ?? { revenue: 0, orders: 0, covers: 0 };
    const current = pick('current');
    const previous = pick('previous');
    const revenue = num(current.revenue);
    const previousRevenue = num(previous.revenue);
    return {
      days: filter.days,
      branchId: filter.branchId ?? 'all',
      revenue,
      orders: num(current.orders),
      covers: num(current.covers),
      revenuePerCover: current.covers ? round(revenue / num(current.covers)) : 0,
      averageOrderValue: current.orders ? round(revenue / num(current.orders)) : 0,
      previousRevenue,
      revenueGrowthPct: previousRevenue ? round(((revenue - previousRevenue) / previousRevenue) * 100, 1) : null,
      currency: 'BDT',
    };
  }

  async itemPerformance(filter: PeriodFilter & { by: 'revenue' | 'quantity' | 'margin'; direction: 'best' | 'worst'; limit: number }) {
    const order = { revenue: 'revenue', quantity: 'quantity', margin: 'margin' }[filter.by];
    const { rows } = await this.db.query(
      `SELECT m.id, m.name, m.category, coalesce(sum(oi.quantity), 0)::int AS quantity,
              coalesce(sum(oi.quantity * oi.unit_price), 0) AS revenue,
              coalesce(sum(oi.quantity * (oi.unit_price - oi.unit_cost)), 0) AS margin,
              m.price, m.cost_price
       FROM menu_items m
       LEFT JOIN order_items oi ON oi.menu_item_id = m.id
         AND oi.placed_at > now() - make_interval(days => $2::int)
         AND ($1::text IS NULL OR oi.order_id IN (SELECT id FROM orders WHERE branch_id = $1))
       GROUP BY m.id ORDER BY ${order} ${filter.direction === 'best' ? 'DESC' : 'ASC'} LIMIT $3`,
      [filter.branchId ?? null, filter.days, filter.limit],
    );
    return rows.map((row) => ({
      id: row.id, name: row.name, category: row.category, quantity: row.quantity, revenue: num(row.revenue),
      grossMargin: num(row.margin), marginPct: num(row.price) ? round(((num(row.price) - num(row.cost_price)) / num(row.price)) * 100, 1) : 0,
    }));
  }

  /** Average revenue, orders and covers by Dhaka weekday. */
  async weekdayPattern(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `WITH daily AS (
         SELECT ${DAY} AS day, sum(o.total) AS revenue, count(*) AS orders, sum(o.covers) AS covers
         FROM orders o WHERE o.status <> 'cancelled' AND ($1::text IS NULL OR o.branch_id = $1)
           AND ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int GROUP BY 1)
       SELECT extract(dow FROM day)::int AS dow, to_char(day, 'FMDay') AS weekday,
              avg(revenue) AS revenue, avg(orders) AS orders, avg(covers) AS covers, count(*)::int AS days
       FROM daily GROUP BY 1, 2 ORDER BY 1`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ weekday: row.weekday, avgRevenue: round(num(row.revenue), 0), avgOrders: round(num(row.orders), 1), avgCovers: round(num(row.covers), 1), days: row.days }));
  }

  async hourlyPattern(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `SELECT extract(hour FROM o.created_at AT TIME ZONE 'Asia/Dhaka')::int AS hour, count(*)::int AS orders, sum(o.total) AS revenue
       FROM orders o WHERE o.status <> 'cancelled' AND ($1::text IS NULL OR o.branch_id = $1)
         AND o.created_at > now() - make_interval(days => $2::int)
       GROUP BY 1 ORDER BY 1`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ hour: row.hour, orders: row.orders, revenue: num(row.revenue) }));
  }

  /** Revenue minus ingredient cost (COGS) minus recorded overheads, per branch. */
  async profitAndLoss(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `WITH sales AS (
         SELECT o.branch_id, sum(oi.quantity * oi.unit_price) AS revenue, sum(oi.quantity * oi.unit_cost) AS cogs
         FROM orders o JOIN order_items oi ON oi.order_id = o.id
         WHERE o.status <> 'cancelled' AND ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int
         GROUP BY 1),
       overhead AS (
         SELECT branch_id, sum(amount) AS overheads FROM expenses
         WHERE incurred_on > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int GROUP BY 1)
       SELECT b.id AS branch_id, b.name, coalesce(s.revenue, 0) AS revenue, coalesce(s.cogs, 0) AS cogs, coalesce(h.overheads, 0) AS overheads
       FROM branches b LEFT JOIN sales s ON s.branch_id = b.id LEFT JOIN overhead h ON h.branch_id = b.id
       WHERE $1::text IS NULL OR b.id = $1 ORDER BY b.id`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => {
      const revenue = num(row.revenue);
      const cogs = num(row.cogs);
      const overheads = num(row.overheads);
      const profit = revenue - cogs - overheads;
      return {
        branchId: row.branch_id, branch: row.name, revenue, cogs, grossProfit: revenue - cogs, overheads, netProfit: profit,
        netMarginPct: revenue ? round((profit / revenue) * 100, 1) : null, status: profit >= 0 ? 'profit' : 'loss',
        note: 'Overheads are whatever is recorded in the expenses table for the window (rent, salaries, utilities).',
      };
    });
  }

  /** Kitchen prep time (placed → ready) and pass time (ready → served) per menu item, in minutes. */
  async prepTimes(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `SELECT m.name, count(*)::int AS samples,
              avg(extract(epoch FROM oi.ready_at - oi.placed_at) / 60) AS avg_prep,
              percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM oi.ready_at - oi.placed_at) / 60) AS p90_prep,
              avg(extract(epoch FROM oi.served_at - oi.ready_at) / 60) AS avg_pass, m.prep_minutes AS target
       FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id JOIN orders o ON o.id = oi.order_id
       WHERE oi.ready_at IS NOT NULL AND oi.placed_at > now() - make_interval(days => $2::int)
         AND ($1::text IS NULL OR o.branch_id = $1)
       GROUP BY m.id ORDER BY avg_prep DESC`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ item: row.name, samples: row.samples, avgPrepMinutes: round(num(row.avg_prep), 1), p90PrepMinutes: round(num(row.p90_prep), 1), avgPassMinutes: round(num(row.avg_pass), 1), targetMinutes: row.target }));
  }

  /** Table turn time (seated → vacated) and spend per cover, per branch. */
  async turnAndSpend(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `SELECT b.id AS branch_id, b.name,
              (SELECT avg(extract(epoch FROM vacated_at - seated_at) / 60) FROM table_sessions s
                 WHERE s.branch_id = b.id AND s.vacated_at IS NOT NULL AND s.seated_at > now() - make_interval(days => $2::int)) AS avg_turn,
              (SELECT sum(total) / nullif(sum(covers), 0) FROM orders o
                 WHERE o.branch_id = b.id AND o.status <> 'cancelled' AND o.created_at > now() - make_interval(days => $2::int)) AS per_cover
       FROM branches b WHERE $1::text IS NULL OR b.id = $1 ORDER BY b.id`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ branchId: row.branch_id, branch: row.name, avgTurnMinutes: round(num(row.avg_turn), 0), revenuePerCover: round(num(row.per_cover), 0) }));
  }

  /** Daily covers joined with weather for correlation analysis. */
  async weatherJoined(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `SELECT w.day::text AS day, w.branch_id, w.precipitation_mm, w.temp_max_c, w.source,
              coalesce(sum(o.covers), 0)::int AS covers, coalesce(sum(o.total), 0) AS revenue
       FROM daily_weather w
       LEFT JOIN orders o ON o.branch_id = w.branch_id AND ${DAY} = w.day AND o.status <> 'cancelled'
       WHERE ($1::text IS NULL OR w.branch_id = $1) AND w.day > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int
         AND w.day < (now() AT TIME ZONE 'Asia/Dhaka')::date
       GROUP BY w.day, w.branch_id, w.precipitation_mm, w.temp_max_c, w.source ORDER BY w.day`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ day: row.day, branchId: row.branch_id, precipitationMm: num(row.precipitation_mm), tempMaxC: num(row.temp_max_c), covers: row.covers, revenue: num(row.revenue), source: row.source }));
  }

  /** Items whose share of sales rises most on rainy days. */
  async rainyDayItemLift(filter: PeriodFilter) {
    const { rows } = await this.db.query(
      `WITH item_days AS (
         SELECT m.name, (w.precipitation_mm > 1) AS rainy, sum(oi.quantity) AS qty
         FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN menu_items m ON m.id = oi.menu_item_id
         JOIN daily_weather w ON w.branch_id = o.branch_id AND w.day = ${DAY}
         WHERE ($1::text IS NULL OR o.branch_id = $1) AND w.day > (now() AT TIME ZONE 'Asia/Dhaka')::date - $2::int
         GROUP BY 1, 2),
       shares AS (SELECT name, rainy, qty / sum(qty) OVER (PARTITION BY rainy) AS share FROM item_days)
       SELECT r.name, r.share AS rainy_share, d.share AS dry_share FROM shares r JOIN shares d ON d.name = r.name AND NOT d.rainy
       WHERE r.rainy ORDER BY r.share / nullif(d.share, 0) DESC NULLS LAST LIMIT 5`,
      [filter.branchId ?? null, filter.days],
    );
    return rows.map((row) => ({ item: row.name, rainyDaySharePct: round(num(row.rainy_share) * 100, 1), dryDaySharePct: round(num(row.dry_share) * 100, 1) }));
  }

  /** Short factual daily notes used as documents for retrieval (one per branch per day). */
  async dailyNotes(days: number) {
    const { rows } = await this.db.query(
      `WITH d AS (
         SELECT o.branch_id, ${DAY} AS day, sum(o.total) AS revenue, count(*) AS orders, sum(o.covers) AS covers
         FROM orders o WHERE o.status <> 'cancelled' AND ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - $1::int
           AND ${DAY} < (now() AT TIME ZONE 'Asia/Dhaka')::date
         GROUP BY 1, 2),
       top AS (
         SELECT DISTINCT ON (o.branch_id, ${DAY}) o.branch_id, ${DAY} AS day, m.name, sum(oi.quantity) OVER (PARTITION BY o.branch_id, ${DAY}, m.id) AS qty
         FROM orders o JOIN order_items oi ON oi.order_id = o.id JOIN menu_items m ON m.id = oi.menu_item_id
         WHERE ${DAY} > (now() AT TIME ZONE 'Asia/Dhaka')::date - $1::int
         ORDER BY o.branch_id, ${DAY}, qty DESC)
       SELECT d.branch_id, b.name AS branch, d.day::text AS day, to_char(d.day, 'FMDay') AS weekday, d.revenue, d.orders, d.covers,
              w.precipitation_mm, t.name AS top_item
       FROM d JOIN branches b ON b.id = d.branch_id
       LEFT JOIN daily_weather w ON w.branch_id = d.branch_id AND w.day = d.day
       LEFT JOIN top t ON t.branch_id = d.branch_id AND t.day = d.day
       ORDER BY d.day, d.branch_id`,
      [days],
    );
    return rows.map((row) => ({
      branchId: row.branch_id, branch: row.branch, day: row.day, weekday: row.weekday, revenue: num(row.revenue),
      orders: Number(row.orders), covers: Number(row.covers), precipitationMm: num(row.precipitation_mm), topItem: row.top_item as string | null,
    }));
  }
}
