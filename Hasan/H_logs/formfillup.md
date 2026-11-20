# Form fill-up guide for the team lead (SeeServe submission)

- **Prepared:** 2026-11-21, from the portal's point-by-point breakdown (Pre-Judgment 194/425).
- **Who fills it:** the **team leader** (other members have view-only access).
- **Submission page:** https://cloudcampbd.com/submissions/e756e755-858d-42d1-bfb3-2482c469fb6f
- **Deadline to watch:** **Zero to Launch – Preliminary Submission, Nov 30 2026, 17:59 UTC.** That phase has no submission yet, so the team leader must create one. Congress Day closes Dec 26, 14:00 UTC.

**Ground rule:** only tick or write what is really in the repo. Each item below says where the proof is. Items in Parts B and C become true only after the code is built on the `hasans-expansion` branch. Until that branch is merged into `main`, link evidence to the branch: `https://github.com/james-vincent21/seeserve/tree/hasans-expansion`.

Points shown in brackets are what the item adds to the Pre-Judgment Score.

---

## Part A: fill or fix NOW (true today), about +32 points → ~226

### A1. Overview → Problem Statement [+2]
It's 798 characters (8/10). Lengthen it to **at least 1,200 characters**. Suggested paragraph to append:

> During peak hours a single floor manager watches 15–40 tables. Guests who are seated but not yet greeted, or who want the bill, wait silently because waving is unreliable and call buttons need hardware on every table. Existing fixes (pagers, POS check-ins, table sensors) need new hardware, staff discipline during the rush, or both. Restaurants in Bangladesh and the wider region already have CCTV, but the footage is only reviewed after something goes wrong. During Ramadan the pattern flips: guests arrive 30–45 minutes before Iftar and wait on purpose, so naive timers would flood staff with false alarms. Owners also lack simple answers on table turn time, wait times and which hours lose money.

### A2. AI-Native Build → LLMs / Models Used [+5 for "≥1 LLM listed", +3 per model]
- Tick **Claude**: the team builds with Claude Code (Hasan's sessions, this guide included). Also tick any other LLM a team member **really** used while building (ChatGPT, Gemini, …): +3 each, up to 15.
- Update "How & why did you use these LLMs?" (currently says no LLM is used). Suggested text:
> Claude (via Claude Code) is our build partner: it reads the codebase, drafts an implementation plan that a human edits and approves, implements it on a feature branch, and logs every change in Hasan/H_logs. The current product itself runs no LLM: perception uses the YOLOv8n vision model, and table states and alerts are deterministic rules. LLM features (guest concierge, owner analytics agent) are being added on the hasans-expansion branch.

### A3. AI-Native Build → AI Development Lifecycle [+2 frameworks, +8 "need 1"]
- Tick **Claude Skills** (Claude Code skills are used in our build sessions) and **AGENTS.md spec** (the team's coding agent used an AGENTS.md; the template is in `docs/MVP-node-api.md` §8).
- **Replace the current "Process notes" text.** It still contains our internal reminder ("Tick the AGENTS.md spec only if…"), which judges will see. Suggested text:
> Spec-driven and gated. A written build brief (docs/MVP-node-api.md) defined goal, stack, privacy rules and 8 milestones; the coding agent worked one milestone at a time under a "no features beyond the prompt" rule, with a done-check after each. For the expansion we use a plan → human edit → approve → implement → log loop: every change starts as a dated implementation plan with critique and decisions, is implemented only after approval on a separate branch (hasans-expansion) that stays mergeable with main, and is recorded in dated logs (Hasan/H_logs) with verify and revert steps, so any iteration can be reviewed or rolled back.

### A4. Prompt Library tab [+5]
Add these two prompts. Both are real prompts from the build and are already in the repo:
1. **"Provider spike"**: the prompt in `docs/MVP-node-api.md` §9 ("Implement milestone 2 only. First compare candidate inference APIs…").
2. **"Agent instructions (AGENTS.md)"**: the block in `docs/MVP-node-api.md` §8.

### A5. Links → Other links [+3]
- https://github.com/james-vincent21/seeserve/blob/main/docs/AI-NATIVE-BUILD.md
- https://github.com/james-vincent21/seeserve/blob/main/docs/DATA-LIFECYCLE.md
- https://github.com/james-vincent21/seeserve/blob/main/docs/MVP-node-api.md

### A6. Fine-tuning / Adaptation (both fields) [+4, optional]
The form says "skip if not applicable". An honest explanation of why we didn't fine-tune still earns the points:
> No fine-tuning. We use a COCO-pretrained YOLOv8n because people and chairs are standard COCO classes, and fine-tuning would require collecting and labelling restaurant footage, which conflicts with our zero-footage privacy rule. Adaptation is done in configuration instead: per-camera table zone polygons, seat capacities, confidence cutoffs and mode-specific thresholds.

### A7. Fix answers that are now out of date (no new points, but judges check Proof)
| Field (Data Lifecycle tab unless noted) | Says now | Should say |
|---|---|---|
| Data quality | "No automated tests yet" | Unit tests with node:test (`npm test`): table state machine, hand-raise rules, inference-output normalization, Standard/Iftar modes; plus a privacy audit script (`npm run check:privacy`). Accuracy is still unmeasured. |
| Storage details | "the event writer is not yet wired in" | Alerts and staff visits are written to `table_events` when PostgreSQL is running; the demo still works without it. |
| Other data stack notes (roadmap) | lists Standard/Iftar modes and unit tests as future work | Both are done; remove them from the roadmap. |
| AI tab → Evaluation & Quality | "There are no automated tests or benchmarks yet" | Mention the unit test suite above; benchmarks are still pending. |

---

## Part B: Sprint 1 is built (branch `hasans-expansion`, 2026-11-21)

Proof links point to the branch until it is merged:
`https://github.com/james-vincent21/seeserve/tree/hasans-expansion/...`

### B1. True now: fill these straight away (about +78 points → ~304)

| Tab → field | Tick / write | Proof | Pts |
|---|---|---|---|
| Data → Storage targets | + **Vector DB (pgvector)** | `apps/api/src/infrastructure/database/migrations/003_rag.sql` | +1 |
| Basics → Vector DB used | pgvector | same | +3 |
| Data → Visualization | Tick **Recharts**. Details: "Recharts line/bar charts in the owner dashboard: revenue trend with 7-day forecast, best sellers, weekday and hourly demand; tables for P&L, prep times, turn times." Dashboards & reports: "/analytics (sales, menu, kitchen, demand, weather), /ops (live queue and bookings over SSE), /docs (live system page)." | `apps/web/src/app/analytics/page.tsx` | +6 |
| Data → ML / analytics methods | + **Forecasting**, + **Anomaly Detection** (+ Statistical Analysis if a slot is free) | `apps/api/src/domain/analytics/forecast.ts` | +2 |
| Data → Data source types | + **Synthetic / AI-generated Data** (90-day demo history, labelled synthetic) | `apps/api/src/infrastructure/seed/synthetic.ts` | +1 |
| Data → MCP servers for data access | "seeserve-analytics and seeserve-ops MCP servers give agents read access to sales, menu, queue and floor data through validated tools; no direct SQL." | `apps/api/src/interfaces/mcp/servers.ts` | +2 |
| Data → Webhooks & exports | "Outbound webhook to a self-hosted n8n workflow for transactional email; Server-Sent Events stream for live dashboards; JSON eval reports." | `infra/n8n/seeserve-email.json` | +1 |
| AI → Retrieval & RAG | Tick: **Naive RAG**, **Vector Database**, **Contextual RAG**, **Variable / Semantic Chunking**, **Hybrid Search**, **Agentic RAG** | `apps/api/src/application/rag/*` | +25 |
| AI → RAG architecture details | Text below (B3) | same | +5 |
| AI → Token tools | + **Anthropic Prompt Caching** | `apps/api/src/application/chat/agent.ts` | +1 |
| AI → MCP | Built: `seeserve-guest`, `seeserve-ops`, `seeserve-analytics`. Transports: **stdio**, **Streamable HTTP**. Clients/hosts: "Claude Desktop / Claude Code (config in docs/MCP.md); tested with raw JSON-RPC". Reuse notes: text below (B3). | `apps/api/src/interfaces/mcp/*`, `docs/MCP.md` | +15 |
| AI → MCP servers we used | Claude Code's **built-in Browser MCP** (used to read the hackathon rubric during the build). Add any others the team really used. | — | +2 |
| AI → Agent frameworks & orchestration (+ agent notes) | Text below (B3) | `apps/api/src/application/chat/agent.ts` | +5 |
| Build Provenance | MCP usage disclosed; MCP servers list; MCP tools exposed (the list in docs/MCP.md); MCP permissions ("guest public + rate-limited; ops/analytics need a staff session or bearer token; every write audited"); context/memory files ("AGENTS.md and CLAUDE.md in the repo root; Claude Code memory") | `docs/MCP.md`, `AGENTS.md`, `CLAUDE.md` | +9 |
| Prompt Library tab | Also add the 4 product prompts: `prompts/guest-concierge.md`, `owner-analyst.md`, `guardrail-screen.md`, `chunk-context.md` | `prompts/` | (Part A already earns the 5) |
| Links → Other links | Replace one doc link with the `/docs` page once it is deployed | `apps/web/src/app/docs/page.tsx` | 0 |

### B2. True after a short action by Hasan (about +51 points → ~355, up to ~363 with a frontend AI builder)

| Action (by Hasan) | Then tick | Pts |
|---|---|---|
| Install Ollama, `ollama pull nomic-embed-text llama3.2:3b qwen2.5:3b mistral:7b deepseek-r1:1.5b`, re-run `npm run db:seed`, then `npm run eval -- --suite=local-models` | LLMs used: Llama, Qwen, Mistral, DeepSeek (+12). Local runtimes: Ollama (+1 +2 bonus +5). Local models run ×4 (+8), open-weight models (+5). Hardware/quantization notes: write your GPU/RAM and "4-bit quantized (Q4_K_M) 1.5B–7B models" (+2) | +35 |
| `npm run stack:up && npm run n8n:import`, connect SMTP, send one real booking email | Workflow automation: **n8n** (+1 +2 bonus), engines (+5), notes (+2); Data → Acquisition: Automated Flows | +10 |
| `cloudflared tunnel --url http://localhost:3001` during a demo | Publish local env: **Cloudflare Tunnel** (+4) + notes (+2) | +6 |
| Use Claude Artifacts / v0 / Lovable for a page design (only if really done) | Frontend AI builders (+1 each, +5 list, +2 notes) | up to +8 |
| Add `ANTHROPIC_API_KEY` to `.env` and run `npm run eval -- --suite=guest,owner` (costs a little) | Real agent scores for the Evaluation text | quality |

### B3. Paste-ready text

**RAG architecture details:**
> Corpus: house policies, FAQ, supplier notes, the live menu and weekly sales logs generated from SQL (synthetic demo data). Pipeline: semantic chunking (split where sentence-embedding similarity drops), then Contextual Retrieval (a local Ollama model writes a one-sentence context for each chunk, prepended before indexing), then nomic-embed-text embeddings in PostgreSQL pgvector (HNSW, cosine) plus a Postgres full-text index on the same contextualised text. Queries run both and fuse with reciprocal-rank fusion (hybrid search). The owner agent decides when to search (agentic RAG) and never takes totals from documents: numbers come from SQL tools. Without Ollama the system falls back to structural chunks and keyword-only search. Eval: hit@3 12/14 and MRR 0.86 in keyword-only mode (evals/results).

**MCP reuse / architecture notes:**
> One tool registry (zod-validated, audited) is the single source of truth for 24 tools. It is served as three least-privilege MCP servers (guest: public booking and queue; ops: staff floor operations; analytics: read-only owner analytics) over stdio and stateless Streamable HTTP, and the same definitions are handed to the in-app Claude agents. A capability added once appears in the chatbot, the dashboard assistant and any external MCP client.

**Agent frameworks & orchestration:**
> Custom orchestration on the Anthropic TypeScript SDK tool runner (beta). Two agents: a guest concierge (effort low, 8 guest tools, up to 6 tool iterations) and an owner analyst (effort medium, 22 ops + analytics tools, up to 10 tool iterations). Each turn: on-device guardrail screen, then the tool loop with strict schemas, then usage accounting against per-conversation caps. Server-side refusal fallback is enabled. LangGraph multi-agent routing is planned for Sprint 2.

**Evaluation & quality measurement (replace the current text):**
> Unit tests (node:test, 44 passing) cover the table-state machine, wait estimation, booking rules, forecasting, chunking, guardrails and the tool registry. An eval runner (npm run eval) scores guardrail precision/recall on 22 labelled messages (precision 1.0, recall 1.0), retrieval hit@3/MRR on 14 questions (12/14, MRR 0.86, keyword-only mode), 16 scripted guest conversations (tool choice, confirmation before booking, refusals), owner answers graded against SQL ground truth computed from the same database, and a local-model comparison on the guardrail task. Results are saved as JSON in evals/results and shown on the /docs page.

**Guardrails, safety & privacy (add to the current text):**
> Chat: rules plus an on-device LLM pre-screen block prompt injection and requests for other guests' data before anything reaches the cloud model; Luhn-checked card numbers are blocked; PII is redacted before logging; chat text is never stored. Tools: strict zod schemas (unknown fields rejected), role-scoped tool sets, explicit guestConfirmed=true before any booking or queue write, the booking email required to cancel, per-conversation turn and output-token caps, audit log of every write.

**Token optimization (add a sentence):**
> For Claude: the tool definitions and system prompt are prompt-cached; the current time goes in a trailing system message so the cached prefix never changes; low effort for the guest bot; numbers are pre-aggregated in SQL so the model reads small JSON results instead of raw rows.

---

## Part C: fill AFTER Sprint 2 (Dec), about +30 points → ~400

| Tab → field | Tick / write | Proof | Pts |
|---|---|---|---|
| Data → Graph DB, AI → Graph RAG/KG | **Neo4j** knowledge graph | `apps/api/src/infrastructure/graph/*` | +11 |
| Data → Warehouse, Formats | **DuckDB** over **Parquet** | analytics export job | +5 |
| AI → Agentic frameworks, workflow, notes | **LangGraph** (owner multi-agent) | `apps/api/src/application/agents/*` | +13 |
| Data → Scrapers / extractors, source types | **Playwright** scraper; Claude PDF extraction; n8n email inbound; Public web | `apps/api/src/infrastructure/scrapers/*` | +7 |

---

## Part D: Team tab
"≥1 NRB member" and "≥1 female member" (+1 each) depend on who is actually on the team. Mark them only if true.

## Part E: Zero to Launch entry (by Nov 30, 17:59 UTC)
The team leader must **create a submission for the "Zero to Launch – Preliminary Submission" phase**. It currently shows "No submission for this phase". Copy the Part A answers into it, and add Part B items that are already working by then.
