import { randomUUID } from 'node:crypto';

import { createAgent } from '@forgewright/agent';
import { AutonomousRunner, commandVerifier } from '@forgewright/autopilot';
import type { McpHost } from '@forgewright/mcp';
import type {
  ContextBuilder,
  ForgewrightConfig,
  GitService,
  Logger,
  MemoryStore,
  ModelRouter,
  Planner,
} from '@forgewright/types';
import type { FastifyInstance } from 'fastify';

import { SseStream } from '../agent/sse.js';

export interface AutopilotRouteDeps {
  readonly config: ForgewrightConfig;
  readonly logger: Logger;
  readonly router: ModelRouter;
  readonly git: GitService;
  readonly planner: Planner;
  readonly contextBuilder?: ContextBuilder;
  readonly memoryStore?: MemoryStore;
  readonly mcpHost?: McpHost;
}

interface AutopilotBody {
  readonly goal?: unknown;
  readonly maxAttempts?: unknown;
  readonly verifyCommand?: unknown;
  readonly plan?: unknown;
  readonly rollbackOnFailure?: unknown;
}

export const registerAutopilotRoutes = (app: FastifyInstance, deps: AutopilotRouteDeps): void => {
  // Autonomous edit→verify→fix loop, streamed as SSE. Actions are auto-approved
  // (the run snapshots the repo first and can roll back), so this is opt-in.
  app.post('/agent/autopilot', async (request, reply) => {
    const body = (request.body ?? {}) as AutopilotBody;
    if (typeof body.goal !== 'string' || body.goal.trim() === '') {
      return reply.status(400).send({ error: { message: '"goal" (string) is required' } });
    }
    const verifyCommand =
      typeof body.verifyCommand === 'string' && body.verifyCommand.trim() !== ''
        ? body.verifyCommand
        : deps.config.verifyCommand;
    if (!verifyCommand) {
      return reply.status(400).send({
        error: { message: 'no verify command; set FORGE_VERIFY_CMD or pass "verifyCommand"' },
      });
    }

    const conversationId = randomUUID();
    const maxAttempts = typeof body.maxAttempts === 'number' ? body.maxAttempts : undefined;
    const usePlan = body.plan === true;
    const rollbackOnFailure = body.rollbackOnFailure === true;

    reply.hijack();
    const sse = new SseStream(reply.raw);
    sse.start();
    sse.send('autopilot_started', { type: 'autopilot_started', conversationId, verifyCommand });

    const controller = new AbortController();
    // Client disconnect is signalled on the response stream, not the request.
    reply.raw.on('close', () => controller.abort());

    const mcpTools = deps.mcpHost?.tools() ?? [];
    const { agent } = createAgent({
      config: deps.config,
      logger: deps.logger.child({ conversationId, mode: 'autopilot' }),
      router: deps.router,
      approver: async () => true, // autonomous: trust + snapshot safety net
      ...(deps.contextBuilder ? { contextBuilder: deps.contextBuilder } : {}),
      ...(deps.memoryStore ? { memoryStore: deps.memoryStore } : {}),
      ...(mcpTools.length > 0 ? { extraTools: mcpTools } : {}),
    });

    const runner = new AutonomousRunner({
      agent,
      verify: commandVerifier(verifyCommand, deps.config.workspaceRoot),
      logger: deps.logger,
      git: deps.git,
      ...(usePlan ? { planner: deps.planner } : {}),
      rollbackOnFailure,
    });

    try {
      for await (const event of runner.run({
        goal: body.goal,
        conversationId,
        signal: controller.signal,
        ...(maxAttempts !== undefined ? { maxAttempts } : {}),
      })) {
        sse.send(event.type, event);
      }
    } catch (error) {
      sse.send('error', {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      sse.end();
    }
  });
};
