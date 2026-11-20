# SeeServe MCP servers

The hub exposes its use cases through the [Model Context Protocol](https://modelcontextprotocol.io), so any MCP
client (Claude Desktop, Claude Code, another agent) can work with the restaurant the same way the built-in chatbots do.

## Servers

All three are built from one tool registry (`apps/api/src/application/tools/registry.ts`). The guest chatbot,
the owner assistant and external MCP clients therefore run the same validated, audited code paths.

| Server | Who | Tools | Writes |
|---|---|---|---|
| `seeserve-guest` | Public | `menu_search`, `branch_info`, `reservation_create`, `reservation_lookup`, `reservation_cancel`, `queue_join`, `queue_status`, `guest_knowledge_search` | Bookings, cancellations, queue tickets — each needs `guestConfirmed: true`; cancelling also needs the booking email |
| `seeserve-ops` | Staff | `queue_board`, `queue_seat`, `queue_update`, `table_vacate`, `floor_status`, `reservations_for_day`, plus read-only guest tools | Seating, ticket status, freeing tables (audited) |
| `seeserve-analytics` | Owner | `sales_summary`, `sales_trend`, `item_performance`, `weekday_pattern`, `hourly_pattern`, `profit_and_loss`, `kitchen_prep_times`, `turn_time_and_spend`, `weather_correlation`, `knowledge_search` | None (all read-only) |

**Permissions.** Splitting the tools into three servers gives each client only what it needs (least privilege).
`seeserve-guest` needs no login and is rate-limited per IP. `seeserve-ops` and `seeserve-analytics` over HTTP need a staff session
cookie or `Authorization: Bearer $MCP_HTTP_TOKEN`. Over stdio the client runs on the same machine with the
database credentials, so it acts as staff. Every write is recorded in `audit_log`. Every tool is annotated with
`readOnlyHint`, and inputs are strict zod schemas: unknown fields are rejected.

## Transports

- **stdio**: `npm run mcp:guest`, `npm run mcp:ops`, `npm run mcp:analytics` (logs go to stderr).
- **Streamable HTTP** (stateless): `POST http://localhost:4000/mcp/{guest|ops|analytics}`.

## Claude Desktop / Claude Code configuration

```json
{
  "mcpServers": {
    "seeserve-analytics": {
      "command": "npm",
      "args": ["run", "--silent", "mcp:analytics"],
      "cwd": "/path/to/seeserve"
    },
    "seeserve-guest-remote": {
      "type": "http",
      "url": "https://<your-tunnel>.trycloudflare.com/mcp/guest"
    }
  }
}
```

## Publishing a local demo (Cloudflare Tunnel)

To let judges or a phone reach the local stack without deploying:

```bash
cloudflared tunnel --url http://localhost:3001   # landing site + chat widget
cloudflared tunnel --url http://localhost:4000   # hub API and MCP endpoints (/mcp/guest is public)
```

Quick tunnels need no account and stop when the command stops. Only the guest MCP server is open. The staff servers
still need `MCP_HTTP_TOKEN`, so set a long random value before exposing the API, and close the tunnel after the demo.
