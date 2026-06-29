import { randomUUID } from 'node:crypto';

import { createAgent } from '@forgewright/agent';
import type { McpHost } from '@forgewright/mcp';
import type {
  AgentTask,
  ContextBuilder,
  Logger,
  MemoryStore,
  ModelRouter,
  ForgewrightConfig,
} from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

import { ApprovalGate } from '../agent/approval-gate.js';
import type { AgentRunManager } from '../agent/run-manager.js';
import { SseStream } from '../agent/sse.js';

export interface AgentRouteDeps {
  readonly config: ForgewrightConfig;
  readonly logger: Logger;
  readonly router: ModelRouter;
  readonly runManager: AgentRunManager;
  readonly contextBuilder?: ContextBuilder;
  readonly memoryStore?: MemoryStore;
  readonly mcpHost?: McpHost;
}

interface RunBody {
  readonly input?: unknown;
  readonly conversationId?: unknown;
  readonly focusPaths?: unknown;
  readonly maxSteps?: unknown;
}

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : undefined;

export const registerAgentRoutes = (app: FastifyInstance, deps: AgentRouteDeps): void => {
  // Start an agent run; responses stream as Server-Sent Events.
  app.post('/agent/runs', async (request, reply) => {
    const body = (request.body ?? {}) as RunBody;
    if (typeof body.input !== 'string' || body.input.trim() === '') {
      return reply.status(400).send({ error: { message: '"input" (string) is required' } });
    }

    const runId = randomUUID();
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : runId;
    const focusPaths = asStringArray(body.focusPaths);
    const maxSteps = typeof body.maxSteps === 'number' ? body.maxSteps : undefined;

    reply.hijack();
    const sse = new SseStream(reply.raw);
    sse.start();

    const gate = new ApprovalGate((event) => sse.send(event.type, event));
    deps.runManager.register(runId, gate);
    sse.send('run_started', { type: 'run_started', runId, conversationId });

    const controller = new AbortController();
    const onClose = (): void => {
      controller.abort();
      gate.rejectAll();
    };
    // Detect client disconnect on the RESPONSE stream. (request.raw 'close' fires
    // as soon as the POST body is received — before streaming — so it must not be
    // used here or the run aborts immediately.)
    reply.raw.on('close', onClose);

    const mcpTools = deps.mcpHost?.tools() ?? [];
    const mcpRules = deps.mcpHost?.permissionRules() ?? [];
    const { agent } = createAgent({
      config: deps.config,
      logger: deps.logger.child({ runId }),
      router: deps.router,
      approver: gate.approver,
      ...(deps.contextBuilder ? { contextBuilder: deps.contextBuilder } : {}),
      ...(deps.memoryStore ? { memoryStore: deps.memoryStore } : {}),
      ...(mcpTools.length > 0 ? { extraTools: mcpTools } : {}),
      ...(mcpRules.length > 0 ? { permissionRules: mcpRules } : {}),
    });

    const task: AgentTask = {
      conversationId,
      input: body.input,
      signal: controller.signal,
      ...(focusPaths ? { focusPaths } : {}),
      ...(maxSteps !== undefined ? { maxSteps } : {}),
    };

    let assistantText = '';
    let completed = false;

    try {
      for await (const event of agent.run(task)) {
        if (event.type === 'message') assistantText += event.delta;
        if (event.type === 'done' && event.reason === 'completed') completed = true;
        sse.send(event.type, event);
      }
    } catch (error) {
      sse.send('error', {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      reply.raw.off('close', onClose);
      deps.runManager.unregister(runId);
      sse.end();
    }

    // Auto-capture a summary of completed runs into long-term memory.
    if (completed && deps.memoryStore && assistantText.trim() !== '') {
      try {
        await deps.memoryStore.remember({
          kind: 'conversation',
          content: `Task: ${body.input}\nOutcome: ${assistantText.slice(0, 1000)}`,
          tags: [conversationId],
          importance: 1,
        });
      } catch (error) {
        deps.logger.warn('memory_capture_failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  // Resolve a pending approval for an in-flight run.
  app.post<{ Params: { runId: string; approvalId: string }; Body: { approved?: unknown } }>(
    '/agent/runs/:runId/approvals/:approvalId',
    async (request, reply) => {
      const { runId, approvalId } = request.params;
      const approved = request.body?.approved === true;
      const resolved = deps.runManager.resolveApproval(runId, approvalId, approved);
      return reply.status(resolved ? 200 : 404).send({ resolved, approved });
    },
  );
};
