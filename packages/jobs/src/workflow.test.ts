import { MemorySink, StructuredLogger } from '@forgewright/shared';
import { describe, expect, it } from 'vitest';

import { WorkflowEngine } from './workflow.js';

const logger = new StructuredLogger({ sink: new MemorySink() });

const buildEngine = () => {
  const engine = new WorkflowEngine(logger);
  engine.registerAction('extractText', async (input) => `text:${String(input)}`);
  engine.registerAction(
    'summarize',
    async (input, params) => `summary(${String(params.style)}):${String(input)}`,
  );
  engine.registerAction('store', async (input, _p, ctx) => {
    ctx.vars.stored = input;
    return input;
  });
  return engine;
};

describe('WorkflowEngine', () => {
  it('threads each step output into the next', async () => {
    const engine = buildEngine();
    engine.registerWorkflow({
      id: 'doc-pipeline',
      name: 'Document pipeline',
      trigger: 'telegram:document',
      steps: [
        { action: 'extractText' },
        { action: 'summarize', with: { style: 'short' } },
        { action: 'store' },
      ],
    });

    const [result] = await engine.trigger('telegram:document', 'report.pdf');
    expect(result?.final).toBe('summary(short):text:report.pdf');
    expect(result?.outputs).toHaveLength(3);
  });

  it('rejects workflows that reference unknown actions', () => {
    const engine = buildEngine();
    expect(() =>
      engine.registerWorkflow({
        id: 'bad',
        name: 'bad',
        trigger: 't',
        steps: [{ action: 'doesNotExist' }],
      }),
    ).toThrow(/unknown action/);
  });

  it('only fires workflows registered for the trigger', async () => {
    const engine = buildEngine();
    engine.registerWorkflow({
      id: 'a',
      name: 'a',
      trigger: 'email:received',
      steps: [{ action: 'extractText' }],
    });
    const results = await engine.trigger('telegram:document', 'x');
    expect(results).toHaveLength(0);
  });
});
