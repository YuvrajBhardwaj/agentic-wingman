import { ForgewrightError } from '@forgewright/shared';
import type { Logger } from '@forgewright/types';

export interface WorkflowStepDef {
  /** Name of a registered action. */
  readonly action: string;
  /** Static parameters passed to the action. */
  readonly with?: Readonly<Record<string, unknown>>;
}

export interface WorkflowDef {
  readonly id: string;
  readonly name: string;
  /** Trigger name that fires this workflow (e.g. "telegram:document"). */
  readonly trigger: string;
  readonly steps: readonly WorkflowStepDef[];
}

export interface WorkflowContext {
  readonly vars: Record<string, unknown>;
  readonly logger: Logger;
  readonly signal?: AbortSignal;
}

/** A reusable step. Receives the previous step's output, its params, and shared context. */
export type WorkflowAction = (
  input: unknown,
  params: Readonly<Record<string, unknown>>,
  ctx: WorkflowContext,
) => Promise<unknown>;

export interface WorkflowRunResult {
  readonly workflowId: string;
  readonly outputs: readonly unknown[];
  readonly final: unknown;
}

/**
 * Runs reusable workflows: a trigger fires a sequence of named actions, each
 * receiving the previous step's output plus a shared variable bag — e.g.
 * "PDF on Telegram → save → extract → summarize → tasks → memory → email".
 */
export class WorkflowEngine {
  private readonly actions = new Map<string, WorkflowAction>();
  private readonly workflows = new Map<string, WorkflowDef>();

  constructor(private readonly logger: Logger) {}

  registerAction(name: string, action: WorkflowAction): void {
    this.actions.set(name, action);
  }

  registerWorkflow(def: WorkflowDef): void {
    for (const step of def.steps) {
      if (!this.actions.has(step.action)) {
        throw new ForgewrightError(
          'NOT_FOUND',
          `Workflow "${def.id}" uses unknown action "${step.action}"`,
          {
            action: step.action,
          },
        );
      }
    }
    this.workflows.set(def.id, def);
  }

  list(): readonly WorkflowDef[] {
    return [...this.workflows.values()];
  }

  /** Fire every workflow registered for `triggerName`. */
  async trigger(
    triggerName: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<readonly WorkflowRunResult[]> {
    const matching = [...this.workflows.values()].filter((w) => w.trigger === triggerName);
    return Promise.all(matching.map((def) => this.run(def, payload, signal)));
  }

  async run(def: WorkflowDef, payload: unknown, signal?: AbortSignal): Promise<WorkflowRunResult> {
    const ctx: WorkflowContext = { vars: {}, logger: this.logger, ...(signal ? { signal } : {}) };
    const outputs: unknown[] = [];
    let input = payload;
    for (const step of def.steps) {
      if (signal?.aborted) break;
      const action = this.actions.get(step.action);
      if (!action) {
        throw new ForgewrightError('NOT_FOUND', `Unknown action "${step.action}"`, {
          action: step.action,
        });
      }
      const output = await action(input, step.with ?? {}, ctx);
      outputs.push(output);
      input = output;
    }
    return { workflowId: def.id, outputs, final: input };
  }
}
