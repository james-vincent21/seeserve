import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Actor } from '../../domain/hub/types.js';
import { executeTool, toolsFor, type Audience } from '../../application/tools/registry.js';
import { container } from '../../container.js';

/**
 * Three MCP servers, split by trust level (least privilege), all built from the one tool registry:
 *   seeserve-guest      public guest actions (menu, booking, queue)       – no auth
 *   seeserve-ops        floor operations (queue board, seating, tables)  – staff auth
 *   seeserve-analytics  sales analytics + document search                 – owner auth
 */
export const mcpServerKinds = ['guest', 'ops', 'analytics'] as const;
export type McpServerKind = (typeof mcpServerKinds)[number];

const descriptions: Record<McpServerKind, string> = {
  guest: 'SeeServe guest concierge tools: menu, branches, reservations and walk-in queue.',
  ops: 'SeeServe floor operations: queue board, seating, tables, reservations and live CCTV floor status.',
  analytics: 'SeeServe owner analytics: sales, items, profit and loss, prep and turn times, weather correlation, document search.',
};

export function createMcpServer(kind: McpServerKind, actor: Actor): McpServer {
  const server = new McpServer({ name: `seeserve-${kind}`, version: '0.2.0' }, { instructions: descriptions[kind] });
  for (const tool of toolsFor([kind as Audience])) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { readOnlyHint: tool.readOnly, destructiveHint: false, idempotentHint: tool.readOnly, openWorldHint: false },
      },
      async (args: unknown) => {
        const outcome = await executeTool(tool, args, { actor, services: container });
        return outcome.ok
          ? { content: [{ type: 'text' as const, text: JSON.stringify(outcome.result, null, 2) }] }
          : { content: [{ type: 'text' as const, text: outcome.error }], isError: true };
      },
    );
  }
  return server;
}
