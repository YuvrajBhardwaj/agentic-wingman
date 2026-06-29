import type { McpHost } from '@forgewright/mcp';
import type { FastifyInstance } from 'fastify';

export interface McpRouteDeps {
  readonly mcpHost: McpHost;
}

export const registerMcpRoutes = (app: FastifyInstance, deps: McpRouteDeps): void => {
  // List configured MCP servers, their connection state, and exposed tools.
  app.get('/mcp/servers', async (_request, reply) => {
    return reply.send({ servers: deps.mcpHost.list() });
  });

  // Hot-reload a single MCP server (reconnect + re-register its tools).
  app.post<{ Params: { name: string } }>('/mcp/servers/:name/reload', async (request, reply) => {
    try {
      const reloaded = await deps.mcpHost.reload(request.params.name);
      if (!reloaded) {
        return reply
          .status(404)
          .send({ error: { message: `unknown MCP server "${request.params.name}"` } });
      }
      return reply.send({ reloaded: true, servers: deps.mcpHost.list() });
    } catch (error) {
      return reply.status(502).send({
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
};
