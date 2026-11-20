// stdout carries the MCP protocol, so every log line must go to stderr. Redirect before anything loads.
console.log = (...args: unknown[]) => console.error(...args);

const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { createMcpServer, mcpServerKinds } = await import('../interfaces/mcp/servers.js');

const kind = process.argv[2] as (typeof mcpServerKinds)[number];
if (!mcpServerKinds.includes(kind)) {
  console.error(`Usage: mcp-stdio <${mcpServerKinds.join('|')}>`);
  process.exit(1);
}

// A local stdio client already has the machine's database credentials, so it acts as staff.
const actor = kind === 'guest'
  ? { kind: 'guest' as const, id: 'stdio', channel: 'mcp' as const }
  : { kind: 'staff' as const, id: 'mcp-stdio', channel: 'mcp' as const };

const server = createMcpServer(kind, actor);
await server.connect(new StdioServerTransport());
console.error(`[mcp] seeserve-${kind} ready on stdio`);
