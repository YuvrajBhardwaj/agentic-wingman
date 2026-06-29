import { DefaultModelRouter } from '@forgewright/llm';
import type { ChatChunk, ChatRequest, LlmProvider, ModelRole } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { AgentCoordinator } from './coordinator.js';

const ROUTES: Record<ModelRole, string> = {
  cheap: 'echo',
  coding: 'echo',
  reasoning: 'echo',
  verification: 'echo',
};

/** Echoes a structured description of the request so contributions are identifiable. */
class EchoProvider implements LlmProvider {
  readonly id = 'echo';
  readonly info = { id: 'echo', contextWindow: 8192 };
  async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
    const sys = request.messages.find((m) => m.role === 'system')?.content ?? '';
    const user = request.messages.find((m) => m.role === 'user')?.content ?? '';
    yield {
      type: 'text',
      delta: JSON.stringify({
        sys: sys.slice(0, 40),
        hasPrior: user.includes('What the team has said'),
      }),
    };
    yield { type: 'done', finishReason: 'stop' };
  }
}

const coordinator = () =>
  new AgentCoordinator(new DefaultModelRouter([new EchoProvider()], ROUTES));

describe('AgentCoordinator', () => {
  it('runs agents in parallel and preserves their order', async () => {
    const result = await coordinator().collaborate(
      'Build a login form',
      ['planner', 'ui-engineer', 'reviewer'],
      { synthesize: async (_g, c) => c.map((x) => x.role).join('+') },
    );
    expect(result.contributions.map((c) => c.role)).toEqual(['planner', 'ui-engineer', 'reviewer']);
    expect(result.contributions[0]?.content).toContain('Planner');
    expect(result.synthesis).toBe('planner+ui-engineer+reviewer');
    // Parallel agents do not see each other's output.
    expect(result.contributions.every((c) => JSON.parse(c.content).hasPrior === false)).toBe(true);
  });

  it('feeds prior contributions to later agents in sequential mode', async () => {
    const result = await coordinator().collaborate('Ship a feature', ['planner', 'reviewer'], {
      mode: 'sequential',
      synthesize: async () => 'done',
    });
    expect(JSON.parse(result.contributions[0]?.content ?? '{}').hasPrior).toBe(false);
    expect(JSON.parse(result.contributions[1]?.content ?? '{}').hasPrior).toBe(true);
  });

  it('uses the default LLM synthesizer when none is provided', async () => {
    const result = await coordinator().collaborate('Plan it', ['planner']);
    expect(result.synthesis.length).toBeGreaterThan(0);
  });

  it('exposes the built-in roles', () => {
    const roles = coordinator().availableRoles();
    expect(roles).toContain('software-engineer');
    expect(roles).toContain('security-auditor');
    expect(roles.length).toBeGreaterThanOrEqual(10);
  });

  it('throws for unknown roles or empty teams', async () => {
    await expect(coordinator().collaborate('x', ['nope'])).rejects.toThrow(/Unknown agent role/);
    await expect(coordinator().collaborate('x', [])).rejects.toThrow(/at least one agent/);
  });
});
