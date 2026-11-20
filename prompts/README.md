# Prompt library

Every prompt the product sends to a model lives here, versioned with front matter (`id`, `version`, `model`, `used_by`).
Runtime code loads the guest and owner system prompts from these files (`apps/api/src/application/chat/prompts.ts`),
so what is reviewed here is exactly what runs.

| Prompt | Model | Purpose |
|---|---|---|
| [guest-concierge.md](guest-concierge.md) | Claude (cloud) | Guest chatbot: menu, bookings, queue, with confirmation before any write |
| [owner-analyst.md](owner-analyst.md) | Claude (cloud) | Owner assistant: numbers only from SQL-backed tools, documents for context |
| [guardrail-screen.md](guardrail-screen.md) | Local Ollama model | On-device prompt-injection / data-exfiltration pre-screen for guest messages |
| [chunk-context.md](chunk-context.md) | Local Ollama model | Contextual Retrieval: situating sentence per chunk before indexing |

Design notes
- **Role + rules + boundaries + style** structure; boundaries are explicit about tool results being data, not instructions.
- **Stable prefix for caching:** system prompts never contain the date or user data. The current Dhaka time is sent as a
  separate system message after the user's turn, so the cached prefix (tools + system prompt) is reused across requests.
- **Changing a prompt:** bump `version`, run `npm run eval` and record the result in `evals/results/`.
