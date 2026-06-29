import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitRepo } from '@forgewright/git';
import { MemorySink, StructuredLogger } from '@forgewright/shared';
import type { Agent, AgentTask } from '@forgewright/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AutonomousRunner, type AutopilotEvent } from './autonomous-runner.js';
import type { Verifier } from './verifier.js';

const logger = new StructuredLogger({ sink: new MemorySink() });

/** A fake agent that runs an optional side effect, then completes. */
const fakeAgent = (onRun?: (task: AgentTask) => Promise<void>): Agent => ({
  async *run(task) {
    await onRun?.(task);
    yield { type: 'message', delta: 'working on it' };
    yield { type: 'done', reason: 'completed' };
  },
});

const collect = async (iter: AsyncIterable<AutopilotEvent>): Promise<AutopilotEvent[]> => {
  const out: AutopilotEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
};

describe('AutonomousRunner', () => {
  it('retries with failure feedback until verification passes', async () => {
    const inputs: string[] = [];
    const agent = fakeAgent(async (task) => {
      inputs.push(task.input);
    });
    let calls = 0;
    const verify: Verifier = async () => {
      calls += 1;
      return calls === 1
        ? { passed: false, output: 'FAIL: expected 2 but got 3' }
        : { passed: true, output: 'all tests passed' };
    };

    const runner = new AutonomousRunner({ agent, verify, logger });
    const events = await collect(runner.run({ goal: 'fix the math bug', conversationId: 'c1' }));

    const attempts = events.filter((e) => e.type === 'attempt');
    expect(attempts).toHaveLength(2);
    expect(inputs[0]).toContain('fix the math bug');
    expect(inputs[1]).toContain('FAIL: expected 2 but got 3');
    expect(events.at(-1)).toEqual({ type: 'done', success: true, attempts: 2 });
  });

  it('stops after max attempts when verification keeps failing', async () => {
    const agent = fakeAgent();
    const verify: Verifier = async () => ({ passed: false, output: 'still broken' });
    const runner = new AutonomousRunner({ agent, verify, logger });
    const events = await collect(
      runner.run({ goal: 'impossible', conversationId: 'c1', maxAttempts: 2 }),
    );
    expect(events.filter((e) => e.type === 'attempt')).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', success: false, attempts: 2 });
  });
});

describe('AutonomousRunner with git', () => {
  let root: string;
  let git: GitRepo;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'fw-auto-'));
    git = new GitRepo({ cwd: root });
    await git.init();
    await writeFile(join(root, 'base.txt'), 'base', 'utf8');
    await git.commit('init');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('snapshots and commits on success', async () => {
    const agent = fakeAgent(async () => {
      await writeFile(join(root, 'feature.txt'), 'new feature', 'utf8');
    });
    const verify: Verifier = async () => ({ passed: true, output: 'ok' });
    const runner = new AutonomousRunner({ agent, verify, logger, git });

    const events = await collect(runner.run({ goal: 'add feature', conversationId: 'c1' }));
    expect(events.some((e) => e.type === 'snapshot')).toBe(true);
    expect(events.some((e) => e.type === 'committed')).toBe(true);
    // Working tree is clean after the auto-commit.
    expect(await git.status()).toHaveLength(0);
  });

  it('rolls back to the snapshot when configured and all attempts fail', async () => {
    const agent = fakeAgent(async () => {
      await writeFile(join(root, 'broken.txt'), 'oops', 'utf8');
    });
    const verify: Verifier = async () => ({ passed: false, output: 'tests failed' });
    const runner = new AutonomousRunner({
      agent,
      verify,
      logger,
      git,
      rollbackOnFailure: true,
    });

    const events = await collect(
      runner.run({ goal: 'break things', conversationId: 'c1', maxAttempts: 2 }),
    );
    expect(events.some((e) => e.type === 'rolled_back')).toBe(true);
    const stillThere = await stat(join(root, 'broken.txt')).then(
      () => true,
      () => false,
    );
    expect(stillThere).toBe(false); // rollback removed the file created during the run
  });
});
