import { Router, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer, mcpServerKinds, type McpServerKind } from './servers.js';
import { rateLimit, resolveStaff } from '../http/middleware.js';

/**
 * Streamable HTTP transport, stateless mode: a fresh server + transport per request.
 * The guest server is public (rate-limited); ops and analytics need a staff session cookie
 * or `Authorization: Bearer $MCP_HTTP_TOKEN`.
 */
export const mcpRouter = Router();

mcpRouter.post('/:server', rateLimit('mcp', 120, 60_000), async (req: Request, res: Response) => {
  const kind = req.params.server as McpServerKind;
  if (!mcpServerKinds.includes(kind)) {
    res.status(404).json({ error: `Unknown MCP server. Use one of: ${mcpServerKinds.join(', ')}` });
    return;
  }
  let actor = { kind: 'guest' as const, id: req.ip ?? 'unknown', channel: 'mcp' as const };
  if (kind !== 'guest') {
    const staff = await resolveStaff(req);
    if (!staff) {
      res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
      return;
    }
    actor = { kind: 'staff', id: staff.email, channel: 'mcp' } as never;
  }
  const server = createMcpServer(kind, actor);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[mcp] request failed', error instanceof Error ? error.message : error);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
  }
});

const methodNotAllowed = (_req: Request, res: Response) =>
  res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server: use POST).' }, id: null });
mcpRouter.get('/:server', methodNotAllowed);
mcpRouter.delete('/:server', methodNotAllowed);
