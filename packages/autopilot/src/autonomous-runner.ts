import { renderPlan } from '@forgewright/planner';
import type { Agent, AgentEvent, GitService, Logger, Plan, Planner } from '@forgewright/types';

import type { Verifier } from './verifier.ts';

export type AutopilotEvent =
  | { readonly type: 'plan'; readonly plan: Plan }
  | { readonly type: 'snapshot'; readonly id: string }
  | { readonly type: 'attempt'; readonly index: number; readonly max: number }
  | { readonly type: 'agent_event'; readonly event: AgentEvent }
  | { readonly type: 'verify'; readonly passed: boolean; readonly output: string }
  | { readonly type: 'committed'; readonly sha: string }
  | { readonly type: 'rolled_back'; readonly snapshotId: string }
  | {
      readonly type: 'done';
      readonly success: boolean;
      readonly attempts: number;
      readonly snapshotId?: string;
    };

export interface AutonomousRunnerOptions {
  readonly agent: Agent;
  readonly verify: Verifier;
  readonly logger: Logger;
  readonly git?: GitService;
  readonly planner?: Planner;
  /** Auto-commit on success (default true when git is present). */
  readonly commitOnSuccess?: boolean;
  /** Roll back to the pre-run snapshot if all attempts fail (default false). */
  readonly rollbackOnFailure?: boolean;
}

export interface AutopilotTask {
  readonly goal: string;
  readonly conversationId: string;
  readonly maxAttempts?: number;
  readonly signal?: AbortSignal;
}

/**
 * The autonomous edit→verify→fix loop. It optionally plans, snapshots the repo,
 * then repeatedly runs the agent and the project's verification, feeding failure
 * output back as a fix request, until verification passes or attempts run out.
 * On success it can commit; on exhaustion it can roll back to the snapshot.
 */
export class AutonomousRunner {
  constructor(private readonly options: AutonomousRunnerOptions) {}

  async *run(task: AutopilotTask): AsyncIterable<AutopilotEvent> {
    const maxAttempts = Math.max(1, task.maxAttempts ?? 3);
    const { agent, verify, git, planner, logger } = this.options;

    let planText = '';
    if (planner) {
      const plan = await planner.plan(task.goal, task.signal);
      planText = renderPlan(plan);
      yield { type: 'plan', plan };
    }

    let snapshotId: string | undefined;
    if (git && (await git.isRepo())) {
      snapshotId = await git.snapshot(`before: ${task.goal.slice(0, 60)}`);
      yield { type: 'snapshot', id: snapshotId };
    }

    let lastFailure = '';

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (task.signal?.aborted) break;
      yield { type: 'attempt', index: attempt, max: maxAttempts };

      const input =
        attempt === 0 ? buildInitialPrompt(task.goal, planText) : buildFixPrompt(lastFailure);

      for await (const event of agent.run({
        conversationId: task.conversationId,
        input,
        ...(task.signal ? { signal: task.signal } : {}),
      })) {
        yield { type: 'agent_event', event };
      }

      const result = await verify(task.signal);
      yield { type: 'verify', passed: result.passed, output: result.output };

      if (result.passed) {
        if (git && (this.options.commitOnSuccess ?? true)) {
          const message = await git.summarizeChanges();
          const sha = await git.commit(`Forgewright: ${task.goal}\n\n${message}`);
          if (sha) yield { type: 'committed', sha };
        }
        yield { type: 'done', success: true, attempts: attempt + 1 };
        return;
      }

      lastFailure = result.output;
      logger.info('autopilot_attempt_failed', { attempt, conversationId: task.conversationId });
    }

    if (git && snapshotId && this.options.rollbackOnFailure) {
      await git.rollback(snapshotId);
      yield { type: 'rolled_back', snapshotId };
    }

    yield {
      type: 'done',
      success: false,
      attempts: maxAttempts,
      ...(snapshotId ? { snapshotId } : {}),
    };
  }
}

const buildInitialPrompt = (goal: string, planText: string): string =>
  planText
    ? `${goal}\n\nFollow this plan:\n${planText}\n\nImplement it, then ensure the project's checks pass.`
    : `${goal}\n\nImplement this, then ensure the project's checks pass.`;

const buildFixPrompt = (failure: string): string =>
  `The verification (tests/lint/build) failed with the following output. Diagnose the root cause and fix it.\n\n${failure}`;
