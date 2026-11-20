# n8n workflows

The hub sends email and runs scheduled jobs through self-hosted [n8n](https://n8n.io) instead of custom
integration code. Workflows are versioned here as JSON so they can be reviewed and reverted like code.

| Workflow | Trigger | What it does |
|---|---|---|
| `seeserve-email.json` | Webhook `POST /webhook/seeserve-email` from the hub | Checks the shared secret and an allow-list of templates, then sends the reservation / queue / sign-in email over SMTP. Execution data is not saved, so guest emails are not kept in n8n. |
| `seeserve-nightly-knowledge.json` | Every night 23:30 Dhaka | Calls the hub to rebuild the retrieval corpus with the latest daily sales logs. |

## Setup

```bash
npm run stack:up          # PostgreSQL + n8n (http://localhost:5678)
npm run n8n:import        # imports every workflow in this folder
```

1. Open http://localhost:5678, create the owner account (local only).
2. In **Send email (SMTP)**, add an SMTP credential. For Gmail use `smtp.gmail.com`, port 465, SSL, and an
   [app password](https://support.google.com/accounts/answer/185833) — never your real password.
3. Activate both workflows.
4. In the repo `.env`, set `N8N_WEBHOOK_BASE_URL=http://localhost:5678/webhook` and the same
   `N8N_WEBHOOK_SECRET` that docker-compose passes to n8n. Set `N8N_MCP_TOKEN` to the hub's `MCP_HTTP_TOKEN`.

Without n8n the hub still works: emails are logged (address masked) instead of sent.
