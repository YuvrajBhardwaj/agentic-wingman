import type { ApprovalGate } from './approval-gate.js';

/** Tracks in-flight agent runs so the approval endpoint can resolve prompts. */
export class AgentRunManager {
  private readonly gates = new Map<string, ApprovalGate>();

  register(runId: string, gate: ApprovalGate): void {
    this.gates.set(runId, gate);
  }

  unregister(runId: string): void {
    this.gates.delete(runId);
  }

  resolveApproval(runId: string, approvalId: string, approved: boolean): boolean {
    return this.gates.get(runId)?.resolve(approvalId, approved) ?? false;
  }

  get activeRuns(): number {
    return this.gates.size;
  }
}
