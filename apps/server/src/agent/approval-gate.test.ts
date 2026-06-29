import type { AgentEvent } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { ApprovalGate } from './approval-gate.js';
import { AgentRunManager } from './run-manager.js';

describe('ApprovalGate', () => {
  it('emits approval_required and resolves on decision', async () => {
    const events: AgentEvent[] = [];
    const gate = new ApprovalGate((e) => events.push(e));

    const pending = gate.approver({
      capability: 'fs.write',
      summary: 'Write a.ts',
      target: 'a.ts',
    });
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event?.type).toBe('approval_required');
    const id = event?.type === 'approval_required' ? event.id : '';

    expect(gate.outstanding).toBe(1);
    expect(gate.resolve(id, true)).toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(gate.outstanding).toBe(0);
  });

  it('rejectAll denies outstanding approvals', async () => {
    const gate = new ApprovalGate(() => {});
    const pending = gate.approver({ capability: 'shell.exec', summary: 'run' });
    gate.rejectAll();
    await expect(pending).resolves.toBe(false);
  });

  it('omits target when not provided', () => {
    const events: AgentEvent[] = [];
    const gate = new ApprovalGate((e) => events.push(e));
    void gate.approver({ capability: 'shell.exec', summary: 'run' });
    const event = events[0];
    expect(event?.type === 'approval_required' && 'target' in event).toBe(false);
  });
});

describe('AgentRunManager', () => {
  it('routes approvals to the correct run', async () => {
    const manager = new AgentRunManager();
    const gate = new ApprovalGate(() => {});
    const pending = gate.approver({ capability: 'fs.write', summary: 'w' });
    manager.register('run-1', gate);

    expect(manager.resolveApproval('unknown', 'x', true)).toBe(false);
    // The approvalId is appr_1 for the first request on this gate.
    expect(manager.resolveApproval('run-1', 'appr_1', true)).toBe(true);
    await expect(pending).resolves.toBe(true);

    manager.unregister('run-1');
    expect(manager.activeRuns).toBe(0);
  });
});
