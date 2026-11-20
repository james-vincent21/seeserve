import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { toolsFor } from '../../application/tools/registry.js';
import { loadPrompt } from '../../application/chat/prompts.js';
import { mcpServerKinds } from '../mcp/servers.js';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { container } from '../../container.js';
import { env } from '../../config/env.js';
import { hubEvents } from '../../application/events.js';
import { AgentUnavailableError, type AgentKind } from '../../application/chat/agent.js';
import { MAX_MESSAGE_CHARS } from '../../application/chat/guardrails.js';
import { buildCorpus } from '../../application/rag/corpus.js';
import { handle, parseBody, rateLimit, requireStaff, SESSION_COOKIE, readCookie, type StaffRequest } from './middleware.js';

/** Hub REST API (v1). Public routes serve the landing page and customer app; /staff routes need a session. */
export const v1Router = Router();

const guestActor = (req: StaffRequest, channel: 'web' | 'chat') => ({ kind: 'guest' as const, id: req.ip ?? 'unknown', channel });
const staffActor = (req: StaffRequest) => ({ kind: 'staff' as const, id: req.staff?.email ?? 'unknown', channel: 'staff' as const });
const param = (req: StaffRequest, name: string) => String(req.params[name] ?? '');
const dhakaToday = () => new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 10);

// ---------- Public ----------------------------------------------------------------------------
/** Live system description for the /docs page: MCP inventory, prompt versions, latest eval run, health. */
v1Router.get('/meta', handle(async (_req, res) => {
  const evalsDir = fileURLToPath(new URL('../../../../../evals/results/', import.meta.url));
  const latestEval = existsSync(evalsDir)
    ? readdirSync(evalsDir).filter((file) => file.endsWith('.json')).sort().pop()
    : undefined;
  let database = 'unavailable';
  try {
    await container.pool.query('SELECT 1');
    database = 'connected';
  } catch {
    // reported as unavailable
  }
  res.json({
    data: {
      mcpServers: mcpServerKinds.map((kind) => ({
        name: `seeserve-${kind}`,
        auth: kind === 'guest' ? 'public (rate-limited)' : 'staff session or MCP_HTTP_TOKEN bearer',
        transports: ['stdio', 'streamable-http'],
        httpPath: `/mcp/${kind}`,
        tools: toolsFor([kind]).map(({ name, title, readOnly }) => ({ name, title, readOnly })),
      })),
      prompts: (['guest-concierge', 'owner-analyst', 'guardrail-screen', 'chunk-context'] as const)
        .map((id) => ({ id, version: loadPrompt(id).version })),
      models: { cloud: env.CLAUDE_MODEL, localChat: env.OLLAMA_CHAT_MODEL, localEmbeddings: env.OLLAMA_EMBED_MODEL, vision: 'YOLOv8n (Ultralytics)' },
      latestEval: latestEval ? { file: latestEval, ...JSON.parse(readFileSync(`${evalsDir}${latestEval}`, 'utf8')).summary } : null,
      health: { database, localModels: await container.ollama.available(), claudeConfigured: Boolean(env.ANTHROPIC_API_KEY), emailWebhook: Boolean(env.N8N_WEBHOOK_BASE_URL) },
    },
  });
}));

v1Router.get('/branches', handle(async (_req, res) => {
  res.json({ data: await container.hub.branches() });
}));

v1Router.get('/menu', handle(async (req, res) => {
  const query = z.object({ q: z.string().max(60).optional(), category: z.string().max(40).optional(), tag: z.string().max(30).optional() }).parse(req.query);
  res.json({ data: await container.hub.menu({ query: query.q, category: query.category, tag: query.tag }) });
}));

const reservationBody = z.object({
  branchId: z.string().min(2).max(40),
  guestName: z.string().trim().min(2).max(80),
  guestEmail: z.email().max(120),
  partySize: z.number().int().min(1).max(20),
  reservedFor: z.iso.datetime({ offset: true }),
  notes: z.string().max(200).optional(),
  consent: z.literal(true, { error: 'Please agree to the privacy notice.' }),
});

v1Router.post('/reservations', rateLimit('reservations', 10, 60_000), handle(async (req, res) => {
  const body = parseBody(reservationBody, req, res);
  if (!body) return;
  res.status(201).json({ data: await container.hub.createReservation(body, guestActor(req, 'web')) });
}));

v1Router.get('/reservations/:code', rateLimit('lookup', 60, 60_000), handle(async (req, res) => {
  res.json({ data: await container.hub.reservationStatus(param(req, 'code')) });
}));

v1Router.post('/reservations/:code/cancel', rateLimit('cancel', 10, 60_000), handle(async (req, res) => {
  const body = parseBody(z.object({ email: z.email() }), req, res);
  if (!body) return;
  res.json({ data: await container.hub.cancelReservation(param(req, 'code'), body.email, guestActor(req, 'web')) });
}));

v1Router.post('/queue', rateLimit('queue', 10, 60_000), handle(async (req, res) => {
  const body = parseBody(z.object({
    branchId: z.string().min(2).max(40),
    guestName: z.string().trim().min(2).max(80),
    guestEmail: z.email().max(120).optional(),
    partySize: z.number().int().min(1).max(20),
  }), req, res);
  if (!body) return;
  res.status(201).json({ data: await container.hub.joinQueue(body, guestActor(req, 'web')) });
}));

v1Router.get('/queue/:code', rateLimit('lookup', 60, 60_000), handle(async (req, res) => {
  res.json({ data: await container.hub.queueStatus(param(req, 'code')) });
}));

// ---------- Chat ------------------------------------------------------------------------------
const chatBody = z.object({
  conversationId: z.uuid().optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(MAX_MESSAGE_CHARS) }))
    .min(1).max(40)
    .refine((messages) => messages[messages.length - 1].role === 'user', 'The last message must be from the user.'),
});

async function chat(kind: AgentKind, req: StaffRequest, res: Response) {
  const body = parseBody(chatBody, req, res);
  if (!body) return;
  const conversationId = body.conversationId ?? randomUUID();
  try {
    const actor = kind === 'guest' ? guestActor(req, 'chat') : staffActor(req);
    const result = await container.agents.run(kind, { conversationId, messages: body.messages, actor });
    res.json({ data: { conversationId, ...result } });
  } catch (error) {
    if (error instanceof AgentUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    throw error;
  }
}

v1Router.post('/chat/guest', rateLimit('chat', 20, 60_000), handle((req, res) => chat('guest', req, res)));
v1Router.post('/chat/owner', requireStaff, rateLimit('owner-chat', 30, 60_000), handle((req, res) => chat('owner', req, res)));

// ---------- Auth ------------------------------------------------------------------------------
v1Router.post('/auth/request-link', rateLimit('login', 5, 15 * 60_000), handle(async (req, res) => {
  const body = parseBody(z.object({ email: z.email() }), req, res);
  if (!body) return;
  await container.auth.requestLink(body.email);
  res.json({ data: { message: 'If that email is an admin account, a sign-in link is on its way.' } });
}));

v1Router.post('/auth/verify', rateLimit('verify', 20, 15 * 60_000), handle(async (req, res) => {
  const body = parseBody(z.object({ token: z.string().min(20).max(200) }), req, res);
  if (!body) return;
  const result = await container.auth.verify(body.token);
  if (!result) {
    res.status(401).json({ error: 'This sign-in link is invalid or has expired. Request a new one.' });
    return;
  }
  res.cookie(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: result.maxAgeMs,
    path: '/',
  });
  res.json({ data: result.session });
}));

v1Router.get('/auth/me', requireStaff, (req: StaffRequest, res) => {
  res.json({ data: req.staff });
});

v1Router.post('/auth/logout', handle(async (req, res) => {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await container.auth.logout(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ data: { signedOut: true } });
}));

// ---------- Staff -----------------------------------------------------------------------------
const staff = Router();
staff.use(requireStaff);
const branchQuery = (req: StaffRequest) => z.object({ branch: z.string().min(2).max(40).default(env.DEFAULT_BRANCH_ID) }).parse(req.query).branch;
const windowQuery = (req: StaffRequest) => z.object({
  branch: z.string().min(2).max(40).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
}).parse(req.query);

staff.get('/overview', handle(async (req, res) => {
  const branchId = branchQuery(req);
  const [board, reservations, floor] = await Promise.all([
    container.hub.queueBoard(branchId),
    container.hub.reservationsForDay(branchId, dhakaToday()),
    container.hub.floor(branchId),
  ]);
  const reservationCounts = reservations.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }), {});
  res.json({
    data: {
      branchId,
      queue: board.counts,
      reservations: reservationCounts,
      occupiedTables: floor.filter((table) => table.occupiedSince).length,
      totalTables: floor.length,
      turnTimes: board.turnTimes,
    },
  });
}));

staff.get('/queue', handle(async (req, res) => {
  res.json({ data: await container.hub.queueBoard(branchQuery(req)) });
}));

staff.post('/queue', handle(async (req, res) => {
  const body = parseBody(z.object({ branchId: z.string(), guestName: z.string().trim().min(2).max(80), partySize: z.number().int().min(1).max(20), guestEmail: z.email().optional() }), req, res);
  if (!body) return;
  res.status(201).json({ data: await container.hub.joinQueue(body, staffActor(req)) });
}));

staff.post('/queue/:id/seat', handle(async (req, res) => {
  const body = parseBody(z.object({ tableId: z.string().min(2).max(40) }), req, res);
  if (!body) return;
  res.json({ data: await container.hub.seatTicket(param(req, 'id'), body.tableId, staffActor(req)) });
}));

staff.post('/queue/:id/status', handle(async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['served', 'left', 'cancelled']) }), req, res);
  if (!body) return;
  res.json({ data: await container.hub.setTicketStatus(param(req, 'id'), body.status, staffActor(req)) });
}));

staff.get('/floor', handle(async (req, res) => {
  res.json({ data: await container.hub.floor(branchQuery(req)) });
}));

staff.post('/tables/:id/vacate', handle(async (req, res) => {
  await container.hub.vacateTable(param(req, 'id'), staffActor(req));
  res.json({ data: { vacated: true } });
}));

staff.get('/reservations', handle(async (req, res) => {
  const query = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(dhakaToday()) }).parse({ day: req.query.day ?? undefined });
  res.json({ data: await container.hub.reservationsForDay(branchQuery(req), query.day) });
}));

staff.post('/reservations/:id/status', handle(async (req, res) => {
  const body = parseBody(z.object({ status: z.enum(['seated', 'completed', 'no_show', 'cancelled']), tableId: z.string().optional() }), req, res);
  if (!body) return;
  res.json({ data: await container.hub.setReservationStatus(param(req, 'id'), body.status, body.tableId ?? null, staffActor(req)) });
}));

// Analytics (owner dashboards). Same services the owner assistant's tools call.
staff.get('/analytics/summary', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.summary({ branchId: branch, days }) });
}));
staff.get('/analytics/trend', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.trend({ branchId: branch, days }) });
}));
staff.get('/analytics/items', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  const options = z.object({ by: z.enum(['revenue', 'quantity', 'margin']).default('revenue'), direction: z.enum(['best', 'worst']).default('best') }).parse(req.query);
  res.json({ data: await container.analytics.items({ branchId: branch, days, limit: 8, ...options }) });
}));
staff.get('/analytics/weekdays', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.weekdays({ branchId: branch, days }) });
}));
staff.get('/analytics/hours', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.hours({ branchId: branch, days }) });
}));
staff.get('/analytics/pnl', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.profitAndLoss({ branchId: branch, days }) });
}));
staff.get('/analytics/prep', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.prepTimes({ branchId: branch, days }) });
}));
staff.get('/analytics/turn', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.turnAndSpend({ branchId: branch, days }) });
}));
staff.get('/analytics/weather', handle(async (req, res) => {
  const { branch, days } = windowQuery(req);
  res.json({ data: await container.analytics.weatherCorrelation({ branchId: branch, days }) });
}));

staff.get('/knowledge/search', handle(async (req, res) => {
  const { q } = z.object({ q: z.string().min(2).max(300) }).parse(req.query);
  res.json({ data: await container.rag.search(q, { limit: 6 }) });
}));
staff.get('/knowledge/stats', handle(async (_req, res) => {
  res.json({ data: { ...(await container.rag.stats()), localModels: await container.ollama.available() } });
}));
staff.post('/knowledge/rebuild', handle(async (_req, res) => {
  const reports = await buildCorpus(container.rag, { menu: await container.hub.menu(), analytics: container.analyticsRepository });
  res.json({ data: reports });
}));

/** Server-Sent Events: queue, reservation and floor changes for the signed-in dashboard. */
staff.get('/stream', (req: StaffRequest, res) => {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' });
  res.write(`event: ready\ndata: {}\n\n`);
  const unsubscribe = hubEvents.subscribe((event) => res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

v1Router.use('/staff', staff);
