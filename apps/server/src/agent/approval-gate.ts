import type { Approver } from '@forgewright/tools';
import type { AgentEvent, PermissionRequest } from '@forgewright/types';

/**
 * Bridges the permission broker's approval prompts to the SSE stream. When a
 * tool needs approval, the gate emits an `approval_required` event and blocks
 * until the client resolves it via the approval endpoint.
 */
export class ApprovalGate {
  private readonly pending = new Map<string, (approved: boolean) => void>();
  private counter = 0;

  constructor(private readonly emit: (event: AgentEvent) => void) {}

  /** The approver to hand to the permission broker. */
  readonly approver: Approver = (request: PermissionRequest) =>
    new Promise<boolean>((resolve) => {
      const approvalId = `appr_${(this.counter += 1)}`;
      this.pending.set(approvalId, resolve);
      const event: AgentEvent =
        request.target !== undefined
          ? {
              type: 'approval_required',
              id: approvalId,
              summary: request.summary,
              target: request.target,
            }
          : { type: 'approval_required', id: approvalId, summary: request.summary };
      this.emit(event);
    });

  /** Resolve a pending approval. Returns false if the id is unknown. */
  resolve(approvalId: string, approved: boolean): boolean {
    const resolver = this.pending.get(approvalId);
    if (!resolver) return false;
    this.pending.delete(approvalId);
    resolver(approved);
    return true;
  }

  /** Reject all outstanding approvals (e.g. on client disconnect). */
  rejectAll(): void {
    for (const resolver of this.pending.values()) resolver(false);
    this.pending.clear();
  }

  get outstanding(): number {
    return this.pending.size;
  }
}
