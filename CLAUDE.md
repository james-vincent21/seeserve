# CLAUDE.md

@AGENTS.md

## Working with Hasan (plan → approve → build → log)
1. For any "implement X" request, first write a plan to `Hasan/H_local/implementation/<date>_<topic>.md`
   (what changes, critique, proposed solution, `✏️ DECISION` lines with defaults). Do not code yet.
2. Implement only what Hasan approves, on the `hasans-expansion` branch, committing as the configured git user
   with no AI co-author trailer.
3. Log the result in `Hasan/H_logs/<date>.md` and refresh `Hasan/H_local/formfillup.md` (portal answers for the team lead).

## Claude API usage in this repo
- SDK: `@anthropic-ai/sdk`; tool loop via `client.beta.messages.toolRunner` with `betaZodTool`.
- Default model `claude-opus-5-5` (env `CLAUDE_MODEL`), server-side refusal fallbacks enabled, system prompt cached,
  current time sent as a trailing system message so the cached prefix stays stable.
