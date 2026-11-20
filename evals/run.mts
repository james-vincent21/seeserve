/**
 * SeeServe evaluation runner.
 *
 *   npm run eval                          # free suites: guardrails + retrieval (needs the database)
 *   npm run eval -- --suite=guest,owner   # Claude agent suites (cost API tokens; need ANTHROPIC_API_KEY)
 *   npm run eval -- --suite=local-models  # compare local Ollama models on the guardrail task
 *   npm run eval -- --all
 *
 * Results are written to evals/results/<timestamp>.json and shown on the dashboard /docs page.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { screenGuestMessage } from '../apps/api/src/application/chat/guardrails.js';
import { loadPrompt, renderPrompt } from '../apps/api/src/application/chat/prompts.js';
import { container } from '../apps/api/src/container.js';
import { env } from '../apps/api/src/config/env.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const load = <T,>(name: string): T => JSON.parse(readFileSync(`${here}cases/${name}.json`, 'utf8')) as T;
const args = process.argv.slice(2);
const all = args.includes('--all');
const requested = args.find((arg) => arg.startsWith('--suite='))?.slice('--suite='.length).split(',') ?? [];
const suites = all ? ['guardrails', 'retrieval', 'guest', 'owner', 'local-models'] : requested.length ? requested : ['guardrails', 'retrieval'];

type CaseResult = { id: string; pass: boolean; detail?: string };
const results: Record<string, { cases: CaseResult[]; summary: Record<string, unknown> }> = {};
const score = (cases: CaseResult[]) => `${cases.filter((c) => c.pass).length}/${cases.length}`;

// ---- Guardrails (deterministic rules, plus the local model when Ollama is online) -------------
async function guardrailSuite() {
  const { cases } = load<{ cases: Array<{ id: string; label: 'safe' | 'unsafe'; text: string }> }>('guardrails');
  const out: CaseResult[] = [];
  let tp = 0, fp = 0, fn = 0;
  for (const item of cases) {
    const verdict = await screenGuestMessage(item.text, container.ollama);
    const blocked = !verdict.allowed;
    if (blocked && item.label === 'unsafe') tp += 1;
    if (blocked && item.label === 'safe') fp += 1;
    if (!blocked && item.label === 'unsafe') fn += 1;
    out.push({ id: item.id, pass: blocked === (item.label === 'unsafe'), detail: `${item.label} → ${blocked ? `blocked (${verdict.reason})` : 'allowed'} by ${verdict.screenedBy.join('+')}` });
  }
  results.guardrails = {
    cases: out,
    summary: { score: score(out), precision: tp + fp ? +(tp / (tp + fp)).toFixed(2) : null, recall: tp + fn ? +(tp / (tp + fn)).toFixed(2) : null, localModel: await container.ollama.available() },
  };
}

// ---- Retrieval hit@3 --------------------------------------------------------------------------
async function retrievalSuite() {
  const { cases } = load<{ cases: Array<{ id: string; query: string; expectTitle: string }> }>('retrieval');
  const out: CaseResult[] = [];
  let reciprocal = 0;
  for (const item of cases) {
    const hits = await container.rag.search(item.query, { limit: 3 });
    const rank = hits.findIndex((hit) => hit.title === item.expectTitle);
    if (rank >= 0) reciprocal += 1 / (rank + 1);
    out.push({ id: item.id, pass: rank >= 0, detail: `top: ${hits.map((hit) => `${hit.title} [${hit.matchedBy.join('+')}]`).join(' | ')}` });
  }
  const stats = await container.rag.stats();
  results.retrieval = {
    cases: out,
    summary: { hitAt3: score(out), mrr: +(reciprocal / cases.length).toFixed(3), mode: stats.embedded > 0 ? 'hybrid (keyword + vector, RRF)' : 'keyword only (no embeddings yet)', chunks: stats.chunks },
  };
}

// ---- Guest concierge (Claude) -----------------------------------------------------------------
interface GuestCase { id: string; turns: string[]; expect: { toolsAny?: string[]; toolsAll?: string[]; toolsNone?: string[]; replyIncludesAny?: string[]; replyExcludes?: string[]; replyMatches?: string; blocked?: boolean } }
async function guestSuite() {
  const { cases } = load<{ cases: GuestCase[] }>('guest-agent');
  const out: CaseResult[] = [];
  let outputTokens = 0;
  for (const item of cases) {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    const tools: string[] = [];
    let reply = '';
    let blocked = false;
    for (const turn of item.turns) {
      messages.push({ role: 'user', content: turn });
      const result = await container.agents.run('guest', { conversationId: crypto.randomUUID(), messages, actor: { kind: 'guest', id: 'eval', channel: 'chat' } });
      tools.push(...result.toolCalls.filter((call) => call.ok).map((call) => call.name));
      reply = result.reply;
      blocked ||= result.blocked;
      outputTokens += result.usage.outputTokens;
      messages.push({ role: 'assistant', content: result.reply });
    }
    const e = item.expect;
    const failures = [
      e.blocked !== undefined && blocked !== e.blocked && `blocked=${blocked}`,
      e.toolsAny && !e.toolsAny.some((tool) => tools.includes(tool)) && `none of ${e.toolsAny.join('/')} called`,
      e.toolsAll && !e.toolsAll.every((tool) => tools.includes(tool)) && `missing ${e.toolsAll.join('/')}`,
      e.toolsNone && e.toolsNone.some((tool) => tools.includes(tool)) && `called forbidden ${e.toolsNone.join('/')}`,
      e.replyIncludesAny && !e.replyIncludesAny.some((text) => reply.includes(text)) && 'reply lacks expected content',
      e.replyExcludes && e.replyExcludes.some((text) => reply.includes(text)) && 'reply has forbidden content',
      e.replyMatches && !new RegExp(e.replyMatches).test(reply) && `reply does not match /${e.replyMatches}/`,
    ].filter(Boolean);
    out.push({ id: item.id, pass: failures.length === 0, detail: failures.length ? `${failures.join('; ')} | tools: ${tools.join(',')}` : `tools: ${tools.join(',') || 'none'}` });
  }
  results.guest = { cases: out, summary: { score: score(out), model: env.CLAUDE_MODEL, prompt: `guest-concierge@${loadPrompt('guest-concierge').version}`, outputTokens } };
}

// ---- Owner analyst (Claude) vs SQL ground truth ----------------------------------------------
const short = (name: string) => name.replace('Dhaka Table House · ', '');
function numbersIn(text: string): number[] {
  const values: number[] = [];
  for (const match of text.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*(million|m\b|lakh|k\b)?/gi)) {
    const base = Number(match[1].replace(/,/g, ''));
    const unit = (match[2] ?? '').toLowerCase();
    values.push(unit === 'million' || unit === 'm' ? base * 1e6 : unit === 'lakh' ? base * 1e5 : unit === 'k' ? base * 1e3 : base);
  }
  return values;
}
async function ownerSuite() {
  const { cases } = load<{ cases: Array<{ id: string; question: string; truth: string; toolsAny: string[] }> }>('owner-agent');
  const a = container.analytics;
  const pnl = await a.profitAndLoss({ days: 30 });
  const summary = await a.summary({ days: 30 });
  const weekdays = await a.weekdays({ days: 56 });
  const weather = await a.weatherCorrelation({ days: 90 });
  const best = (await a.items({ days: 30, by: 'revenue', direction: 'best', limit: 1 }))[0].name;
  const worstMargin = (await a.items({ days: 30, by: 'margin', direction: 'worst', limit: 1 }))[0].name;
  const slowestPrep = (await a.prepTimes({ days: 14 }))[0].item;
  const slowestDay = [...weekdays].sort((x, y) => x.avgRevenue - y.avgRevenue)[0].weekday;
  const truth: Record<string, (reply: string) => boolean> = {
    loss_branches: (r) => pnl.filter((p) => p.status === 'loss').every((p) => r.includes(short(p.branch))),
    best_item: (r) => r.includes(best),
    worst_margin_item: (r) => r.includes(worstMargin),
    slowest_weekday: (r) => r.includes(slowestDay),
    revenue_30: (r) => numbersIn(r).some((value) => Math.abs(value - summary.revenue) / summary.revenue < 0.01),
    growth_direction: (r) => ((summary.revenueGrowthPct ?? 0) >= 0 ? /grow|up|increase|higher|rose/i : /declin|down|decrease|lower|fell/i).test(r),
    slowest_prep_item: (r) => r.includes(slowestPrep),
    rain_effect: (r) => ((weather.rainyDayCoverChangePct ?? 0) < 0 ? /fewer|lower|drop|less|down|declin/i : /more|higher|increase/i).test(r),
    lobster_note: (r) => /minimum|10 ?kg|margin|Chattogram/i.test(r),
  };

  const out: CaseResult[] = [];
  let outputTokens = 0;
  for (const item of cases) {
    const result = await container.agents.run('owner', {
      conversationId: crypto.randomUUID(),
      messages: [{ role: 'user', content: item.question }],
      actor: { kind: 'staff', id: 'eval', channel: 'staff' },
    });
    outputTokens += result.usage.outputTokens;
    const tools = result.toolCalls.filter((call) => call.ok).map((call) => call.name);
    const usedTool = item.toolsAny.some((tool) => tools.includes(tool));
    const correct = truth[item.truth](result.reply);
    out.push({ id: item.id, pass: usedTool && correct, detail: `${correct ? 'matches SQL truth' : 'does NOT match SQL truth'}; tools: ${tools.join(',')}` });
  }
  results.owner = { cases: out, summary: { score: score(out), model: env.CLAUDE_MODEL, prompt: `owner-analyst@${loadPrompt('owner-analyst').version}`, outputTokens } };
}

// ---- Local model comparison on the guardrail classification task -----------------------------
async function localModelSuite() {
  if (!(await container.ollama.available())) {
    results['local-models'] = { cases: [], summary: { skipped: 'Ollama is not running' } };
    return;
  }
  const models = (process.env.OLLAMA_EVAL_MODELS ?? 'llama3.2:3b,qwen2.5:3b,mistral:7b,deepseek-r1:1.5b').split(',').map((m) => m.trim());
  const { cases } = load<{ cases: Array<{ id: string; label: 'safe' | 'unsafe'; text: string }> }>('guardrails');
  const out: CaseResult[] = [];
  const perModel: Record<string, unknown> = {};
  for (const model of models) {
    let correct = 0;
    const started = Date.now();
    try {
      for (const item of cases) {
        const raw = await container.ollama.generate(renderPrompt('guardrail-screen', { message: item.text }), { model, maxTokens: model.startsWith('deepseek-r1') ? 400 : 4 });
        const answer = raw.replace(/<think>[\s\S]*?<\/think>/g, '');
        const predicted = /\bUNSAFE\b/i.test(answer) ? 'unsafe' : 'safe';
        if (predicted === item.label) correct += 1;
      }
      perModel[model] = { accuracy: +(correct / cases.length).toFixed(2), avgLatencyMs: Math.round((Date.now() - started) / cases.length) };
      out.push({ id: model, pass: true, detail: JSON.stringify(perModel[model]) });
    } catch (error) {
      perModel[model] = { error: error instanceof Error ? error.message : String(error) };
      out.push({ id: model, pass: false, detail: `not available: ${(perModel[model] as { error: string }).error}` });
    }
  }
  results['local-models'] = { cases: out, summary: { task: 'guardrail SAFE/UNSAFE classification (LLM only, no rules)', models: perModel } };
}

const runners: Record<string, () => Promise<void>> = { guardrails: guardrailSuite, retrieval: retrievalSuite, guest: guestSuite, owner: ownerSuite, 'local-models': localModelSuite };
try {
  for (const suite of suites) {
    if (!runners[suite]) throw new Error(`Unknown suite "${suite}". Use: ${Object.keys(runners).join(', ')}`);
    if ((suite === 'guest' || suite === 'owner') && !env.ANTHROPIC_API_KEY) {
      results[suite] = { cases: [], summary: { skipped: 'ANTHROPIC_API_KEY not set' } };
      continue;
    }
    console.log(`[eval] running ${suite}…`);
    await runners[suite]();
  }
  const summary = Object.fromEntries(Object.entries(results).map(([name, value]) => [name, value.summary]));
  const runAt = new Date().toISOString();
  mkdirSync(`${here}results`, { recursive: true });
  const file = `${here}results/${runAt.slice(0, 16).replace(/[:T]/g, '-')}.json`;
  writeFileSync(file, `${JSON.stringify({ runAt, summary, suites: results }, null, 2)}\n`);
  for (const [name, value] of Object.entries(results)) {
    console.log(`\n== ${name}: ${JSON.stringify(value.summary)}`);
    for (const item of value.cases.filter((c) => !c.pass)) console.log(`  ✗ ${item.id}: ${item.detail}`);
  }
  console.log(`\n[eval] saved ${file}`);
} finally {
  await container.pool.end();
}
