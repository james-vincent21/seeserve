import { z } from 'zod';
import type { Actor } from '../../domain/hub/types.js';
import { HubError, type HubService } from '../hub/hub-service.js';
import type { AnalyticsService } from '../analytics/analytics-service.js';
import type { RagService } from '../rag/rag-service.js';
import type { DemoSession } from '../demo/demo-session.js';

export interface ToolServices {
  hub: HubService;
  analytics: AnalyticsService;
  rag: RagService;
  demo: DemoSession;
}

/**
 * One tool registry, reused by every AI surface:
 *   - guest concierge chatbot and the `seeserve-guest` MCP server  → audience 'guest'
 *   - owner assistant and the `seeserve-ops` / `seeserve-analytics` MCP servers → 'ops' / 'analytics'
 * Each tool validates its input with zod, runs a hub use case, and is audited when it writes.
 */
export type Audience = 'guest' | 'ops' | 'analytics';

export interface ToolContext {
  actor: Actor;
  services: ToolServices;
}

export interface ToolDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  audience: Audience[];
  /** Read-only tools never change data; write tools are audited and listed as such in MCP annotations. */
  readOnly: boolean;
  input: Shape;
  run: (input: z.infer<z.ZodObject<Shape>>, ctx: ToolContext) => Promise<unknown>;
}

const defineTool = <Shape extends z.ZodRawShape>(tool: ToolDefinition<Shape>) => tool as unknown as ToolDefinition;

const branchId = z.string().min(2).max(40).describe('Branch id: "gulshan", "dhanmondi" or "uttara".');
const optionalBranch = branchId.optional().describe('Branch id, or omit for all branches.');
const days = z.number().int().min(1).max(365).default(30).describe('Look-back window in days ending today.');
const ticketCode = z.string().min(3).max(20).describe('Ticket number, e.g. "R-7KX2QD" or "Q-PH3M9A".');
const confirmed = z.literal(true).describe('Set to true only after the guest explicitly confirmed the summarised details in this conversation.');

/** "2026-11-21T19:30" in Dhaka time → ISO UTC. */
const dhakaLocalToIso = (local: string) => new Date(`${local}:00+06:00`).toISOString();

export const tools: ToolDefinition[] = [
  // ---- Guest-facing (also available to staff) -------------------------------------------------
  defineTool({
    name: 'menu_search',
    title: 'Search the menu',
    description: 'Find dishes by keyword, category (Starters, Rice & Biryani, Mains, Grill, Breads, Desserts, Drinks) or tag (vegetarian, signature, rainy-day, iftar). Prices are in BDT.',
    audience: ['guest', 'ops'],
    readOnly: true,
    input: { query: z.string().max(60).optional(), category: z.string().max(40).optional(), tag: z.string().max(30).optional() },
    run: async (input, ctx) => (await ctx.services.hub.menu(input)).map(({ id, name, category, description, price, tags }) => ({ id, name, category, description, priceBdt: price, tags })),
  }),
  defineTool({
    name: 'branch_info',
    title: 'Branches and opening hours',
    description: 'List restaurant branches with address, phone, map coordinates and opening hours.',
    audience: ['guest', 'ops'],
    readOnly: true,
    input: {},
    run: async (_input, ctx) => ctx.services.hub.branches(),
  }),
  defineTool({
    name: 'reservation_create',
    title: 'Book a table',
    description: 'Create a table reservation and email the ticket to the guest. Before calling, collect branch, name, email, party size and date/time, read them back to the guest and get an explicit yes.',
    audience: ['guest', 'ops'],
    readOnly: false,
    input: {
      branchId,
      guestName: z.string().min(2).max(80),
      guestEmail: z.email().max(120),
      partySize: z.number().int().min(1).max(20),
      reservedForLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).describe('Dhaka local date and time, format YYYY-MM-DDTHH:mm.'),
      notes: z.string().max(200).optional(),
      guestConfirmed: confirmed,
    },
    run: async (input, ctx) => ctx.services.hub.createReservation({ ...input, reservedFor: dhakaLocalToIso(input.reservedForLocal) }, ctx.actor),
  }),
  defineTool({
    name: 'reservation_lookup',
    title: 'Check a reservation',
    description: 'Look up a reservation by its R- ticket number and return its status, time and party size.',
    audience: ['guest', 'ops'],
    readOnly: true,
    input: { code: ticketCode },
    run: async (input, ctx) => ctx.services.hub.reservationStatus(input.code),
  }),
  defineTool({
    name: 'reservation_cancel',
    title: 'Cancel a reservation',
    description: 'Cancel a reservation. Requires the R- ticket number and the exact email used to book, plus explicit guest confirmation.',
    audience: ['guest'],
    readOnly: false,
    input: { code: ticketCode, email: z.email().max(120), guestConfirmed: confirmed },
    run: async (input, ctx) => ctx.services.hub.cancelReservation(input.code, input.email, ctx.actor),
  }),
  defineTool({
    name: 'queue_join',
    title: 'Join the walk-in queue',
    description: 'Give a walk-in party a Q- queue ticket with its position and estimated wait. Email is optional (ticket is emailed if given).',
    audience: ['guest', 'ops'],
    readOnly: false,
    input: { branchId, guestName: z.string().min(2).max(80), partySize: z.number().int().min(1).max(20), guestEmail: z.email().max(120).optional(), guestConfirmed: confirmed },
    run: async (input, ctx) => ctx.services.hub.joinQueue(input, ctx.actor),
  }),
  defineTool({
    name: 'queue_status',
    title: 'Check queue position',
    description: 'Return the position, parties ahead and estimated wait for a Q- queue ticket.',
    audience: ['guest', 'ops'],
    readOnly: true,
    input: { code: ticketCode },
    run: async (input, ctx) => ctx.services.hub.queueStatus(input.code),
  }),
  defineTool({
    name: 'guest_knowledge_search',
    title: 'Search house information',
    description: 'Search the restaurant FAQ, policies and menu text (parking, dietary needs, Iftar service, booking rules, privacy).',
    audience: ['guest'],
    readOnly: true,
    input: { query: z.string().min(2).max(200) },
    run: async (input, ctx) => (await ctx.services.rag.search(input.query, { limit: 4, sourceTypes: ['faq', 'policy', 'menu'] }))
      .map(({ title, content, matchedBy }) => ({ title, content, matchedBy })),
  }),

  // ---- Operations (staff / owner) -------------------------------------------------------------
  defineTool({
    name: 'queue_board',
    title: 'Today\'s queue',
    description: 'Today\'s walk-in queue for a branch with positions, wait estimates and counts (waiting, seated, served, left).',
    audience: ['ops'],
    readOnly: true,
    input: { branchId },
    run: async (input, ctx) => ctx.services.hub.queueBoard(input.branchId),
  }),
  defineTool({
    name: 'queue_seat',
    title: 'Seat a queue ticket',
    description: 'Seat a waiting queue ticket at a table. Opens a table session used for turn-time statistics.',
    audience: ['ops'],
    readOnly: false,
    input: { ticket: ticketCode, tableId: z.string().min(2).max(40) },
    run: async (input, ctx) => ctx.services.hub.seatTicket(input.ticket, input.tableId, ctx.actor),
  }),
  defineTool({
    name: 'queue_update',
    title: 'Update a queue ticket',
    description: 'Mark a queue ticket as served, left (walked away) or cancelled.',
    audience: ['ops'],
    readOnly: false,
    input: { ticket: ticketCode, status: z.enum(['served', 'left', 'cancelled']) },
    run: async (input, ctx) => ctx.services.hub.setTicketStatus(input.ticket, input.status, ctx.actor),
  }),
  defineTool({
    name: 'table_vacate',
    title: 'Free a table',
    description: 'Mark a table as vacated, closing its current seating.',
    audience: ['ops'],
    readOnly: false,
    input: { tableId: z.string().min(2).max(40) },
    run: async (input, ctx) => {
      await ctx.services.hub.vacateTable(input.tableId, ctx.actor);
      return { tableId: input.tableId, vacated: true };
    },
  }),
  defineTool({
    name: 'floor_status',
    title: 'Floor status',
    description: 'Tables at a branch with occupancy, plus the live CCTV-derived table states and active alerts (Gulshan demo camera).',
    audience: ['ops'],
    readOnly: true,
    input: { branchId },
    run: async (input, ctx) => {
      const floor = await ctx.services.hub.floor(input.branchId);
      const cctv = input.branchId === 'gulshan' ? ctx.services.demo.snapshot() : null;
      return {
        tables: floor,
        cctv: cctv && {
          mode: cctv.mode,
          tables: cctv.tables.map(({ id, label, status, seatedAt, seats }) => ({ id, label, status, seatedAtClipSeconds: seatedAt, occupiedSeats: seats.filter((s) => s.occupied).length, seats: seats.length })),
          activeAlerts: cctv.alerts.map(({ tableLabel, type, message }) => ({ tableLabel, type, message })),
        },
      };
    },
  }),
  defineTool({
    name: 'reservations_for_day',
    title: 'Reservations for a day',
    description: 'All reservations at a branch for a Dhaka calendar day (default today), with status.',
    audience: ['ops'],
    readOnly: true,
    input: { branchId, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
    run: async (input, ctx) => (await ctx.services.hub.reservationsForDay(input.branchId, input.day ?? new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10)))
      .map(({ guestEmail: _email, ...rest }) => rest),
  }),

  // ---- Analytics (owner) ----------------------------------------------------------------------
  defineTool({
    name: 'sales_summary',
    title: 'Sales summary',
    description: 'Revenue, orders, covers, revenue per cover and growth versus the previous window of the same length. Amounts in BDT.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days },
    run: async (input, ctx) => ctx.services.analytics.summary(input),
  }),
  defineTool({
    name: 'sales_trend',
    title: 'Revenue trend and forecast',
    description: 'Daily revenue series, a 7-day forecast (trend + weekday seasonality) and anomaly days.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days: days.default(60) },
    run: async (input, ctx) => {
      const trend = await ctx.services.analytics.trend(input);
      return { ...trend, series: trend.series.slice(-21), note: 'Series truncated to the last 21 days; forecast and anomalies use the full window.' };
    },
  }),
  defineTool({
    name: 'item_performance',
    title: 'Best and worst sellers',
    description: 'Rank menu items by revenue, quantity or gross margin, best or worst first.',
    audience: ['analytics'],
    readOnly: true,
    input: {
      branchId: optionalBranch,
      days,
      by: z.enum(['revenue', 'quantity', 'margin']).default('revenue'),
      direction: z.enum(['best', 'worst']).default('best'),
      limit: z.number().int().min(1).max(25).default(5),
    },
    run: async (input, ctx) => ctx.services.analytics.items(input),
  }),
  defineTool({
    name: 'weekday_pattern',
    title: 'Busy and slow days',
    description: 'Average revenue, orders and covers by weekday (Dhaka time) to find slow and busy days.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days: days.default(56) },
    run: async (input, ctx) => ctx.services.analytics.weekdays(input),
  }),
  defineTool({
    name: 'hourly_pattern',
    title: 'Orders by hour',
    description: 'Orders and revenue by hour of day (Dhaka time).',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days },
    run: async (input, ctx) => ctx.services.analytics.hours(input),
  }),
  defineTool({
    name: 'profit_and_loss',
    title: 'Profit and loss',
    description: 'Per branch: revenue, ingredient cost (COGS), gross profit, recorded overheads and net profit or loss.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days },
    run: async (input, ctx) => ctx.services.analytics.profitAndLoss(input),
  }),
  defineTool({
    name: 'kitchen_prep_times',
    title: 'Kitchen prep times',
    description: 'Average and 90th-percentile prep time (order placed → ready) and pass time (ready → served) per dish, against the target.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days: days.default(14) },
    run: async (input, ctx) => ctx.services.analytics.prepTimes(input),
  }),
  defineTool({
    name: 'turn_time_and_spend',
    title: 'Table turn time and spend per cover',
    description: 'Average table turn time (seated → vacated) and revenue per cover for each branch.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days },
    run: async (input, ctx) => ctx.services.analytics.turnAndSpend(input),
  }),
  defineTool({
    name: 'weather_correlation',
    title: 'Weather vs sales',
    description: 'Correlation between rainfall and covers, average covers on rainy vs dry days, and dishes that sell more when it rains.',
    audience: ['analytics'],
    readOnly: true,
    input: { branchId: optionalBranch, days: days.default(90) },
    run: async (input, ctx) => ctx.services.analytics.weatherCorrelation(input),
  }),
  defineTool({
    name: 'knowledge_search',
    title: 'Search business documents',
    description: 'Hybrid (keyword + vector) search over house documents: policies, supplier notes, FAQ, menu text and weekly sales logs. Use for "why"/"what happened" context, never as the source of totals.',
    audience: ['analytics'],
    readOnly: true,
    input: {
      query: z.string().min(2).max(300),
      sourceTypes: z.array(z.enum(['menu', 'policy', 'daily_summary', 'supplier_note', 'faq', 'other'])).optional(),
    },
    run: async (input, ctx) => ctx.services.rag.search(input.query, { limit: 6, sourceTypes: input.sourceTypes }),
  }),
];

export function toolsFor(audiences: Audience[]): ToolDefinition[] {
  return tools.filter((tool) => tool.audience.some((audience) => audiences.includes(audience)));
}

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/** Validates input and runs a tool; user-facing errors are returned, unexpected ones are hidden. */
export async function executeTool(tool: ToolDefinition, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = z.object(tool.input).strict().safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'} ${issue.message}`).join('; ')}` };
  }
  try {
    return { ok: true, result: await tool.run(parsed.data, ctx) };
  } catch (error) {
    if (error instanceof HubError) return { ok: false, error: error.message };
    const code = (error as { code?: string }).code;
    if (code === 'ECONNREFUSED' || code === '42P01') return { ok: false, error: 'The restaurant database is unavailable right now.' };
    console.error(`[tool:${tool.name}] failed`, error instanceof Error ? error.message : error);
    return { ok: false, error: 'The tool failed unexpectedly.' };
  }
}
