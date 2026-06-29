import { DefaultModelRouter, FakeLlmProvider } from '@forgewright/llm';
import type { ModelRole } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { LlmPlanner } from './llm-planner.js';
import { planLeaves, renderPlan } from './render.js';

const ROUTES: Record<ModelRole, string> = {
  cheap: 'fake',
  coding: 'fake',
  reasoning: 'fake',
  verification: 'fake',
};

const planJson = JSON.stringify({
  tasks: [
    {
      title: 'Add config loader',
      description: 'Load env config',
      subtasks: [
        { title: 'Define schema', description: '' },
        { title: 'Parse env', description: '' },
      ],
    },
    { title: 'Wire into server', description: 'Use the config', subtasks: [] },
  ],
});

const makePlanner = (text: string) => {
  const provider = new FakeLlmProvider(
    [
      [
        { type: 'text', delta: text },
        { type: 'done', finishReason: 'stop' },
      ],
    ],
    'fake',
  );
  const router = new DefaultModelRouter([provider], ROUTES);
  let counter = 0;
  return new LlmPlanner({ router, now: () => 42, generateId: () => `n${(counter += 1)}` });
};

describe('LlmPlanner', () => {
  it('parses a JSON plan into a goal → tasks → subtasks tree', async () => {
    const plan = await makePlanner(planJson).plan('Build a config system');
    expect(plan.goal).toBe('Build a config system');
    expect(plan.createdAt).toBe(42);
    expect(plan.root.children).toHaveLength(2);
    expect(plan.root.children[0]?.children).toHaveLength(2);
    expect(planLeaves(plan).map((l) => l.title)).toEqual([
      'Define schema',
      'Parse env',
      'Wire into server',
    ]);
  });

  it('extracts JSON wrapped in markdown fences', async () => {
    const plan = await makePlanner(`Here is the plan:\n\`\`\`json\n${planJson}\n\`\`\``).plan('x');
    expect(plan.root.children).toHaveLength(2);
  });

  it('renders a plan as an indented checklist', async () => {
    const plan = await makePlanner(planJson).plan('Build a config system');
    const rendered = renderPlan(plan);
    expect(rendered).toContain('- [ ] Add config loader');
    expect(rendered).toContain('  - [ ] Define schema');
  });

  it('throws on a response with no JSON', async () => {
    await expect(makePlanner('I cannot help with that.').plan('x')).rejects.toThrow();
  });
});
