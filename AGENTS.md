# AGENTS.md — SeeServe

Instructions for AI coding agents (Claude Code, Codex, Cursor, …) working in this repository.

## What this is
A restaurant floor-intelligence hub. `apps/api` (Express, TypeScript) is the hub: CCTV demo, reservations, queue,
analytics, retrieval, chat agents and MCP servers. `apps/web` is the staff/owner dashboard, `apps/landing` the public
site. Peripheral apps talk to the hub only through REST (`/api/v1`) or MCP (`/mcp/*`), never to the database.

## Commands
- `npm install` · `npm run dev` (api :4000, dashboard :3000, landing :3001)
- Database: `npm run db:up` (Docker) or `npm run db:lite` (PGlite, no Docker) → `npm run db:seed`
- Checks before any commit: `npm test`, `npm run typecheck`, `npm run build`, `npm run check:privacy`
- Evals: `npm run eval` (free suites); `npm run eval -- --suite=guest,owner` costs API tokens — ask first

## Architecture rules
- Clean architecture: `domain/` is pure (no I/O, unit-tested), `application/` holds use cases, `infrastructure/` adapters,
  `interfaces/` HTTP + MCP. New capabilities go into `application/tools/registry.ts` so chatbots and MCP share them.
- Numbers shown to users come from SQL in `AnalyticsRepository`. The LLM may explain numbers, never invent them.
- Prompts live in `prompts/*.md` with a version in front matter. Change a prompt → bump its version → run evals.
- Every migration in `infrastructure/database/migrations/` must be idempotent (`IF NOT EXISTS`, `ON CONFLICT`).

## Privacy and safety (non-negotiable)
- Never store, log or persist video, frames, crops or images. `npm run check:privacy` must pass.
- Never log request bodies, chat text or emails. Use `maskEmail` / `redactPII` when something must be logged.
- Guest-facing writes require explicit confirmation (`guestConfirmed: true`); staff tools stay behind auth.
- Never commit `.env` or keys. Synthetic data must stay labelled `source = 'synthetic'`.

## Git workflow for this project
- Work on a feature branch (currently `hasans-expansion`); never commit to `main` (Render deploys it).
- Keep branches mergeable: merge `origin/main` in before pushing; don't rewrite pushed history.
- Record each change in `Hasan/H_logs/<date>.md`: what, why, how to verify, how to revert.
