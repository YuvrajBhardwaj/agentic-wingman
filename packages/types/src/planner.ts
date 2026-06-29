export type TaskStatus = 'pending' | 'in-progress' | 'done' | 'failed' | 'skipped';

export interface VerificationResult {
  readonly passed: boolean;
  readonly details: string;
}

export interface PlanNode {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: TaskStatus;
  /** Subtasks; a leaf node is directly executable. */
  readonly children: readonly PlanNode[];
  readonly verification?: VerificationResult;
  /** Free-form reflection produced after execution. */
  readonly reflection?: string;
}

export interface Plan {
  readonly id: string;
  readonly goal: string;
  readonly root: PlanNode;
  readonly createdAt: number;
}

/** Hierarchical planner: goal -> tasks -> subtasks. */
export interface Planner {
  plan(goal: string, signal?: AbortSignal): Promise<Plan>;
}
