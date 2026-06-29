import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ForgewrightClient } from '../api/client.ts';
import type { AppEvent } from '../api/events.ts';

import { useAgentRun } from './useAgentRun.ts';

const fakeClient = (events: readonly AppEvent[]): ForgewrightClient => ({
  runAgent: async ({ onEvent }) => {
    for (const e of events) onEvent(e);
  },
  resolveApproval: vi.fn(async () => {}),
  listMemories: vi.fn(async () => []),
  searchMemories: vi.fn(async () => []),
  addMemory: vi.fn(async () => ({
    id: 'm',
    kind: 'summary' as const,
    content: '',
    tags: [],
    importance: 1,
    createdAt: 0,
    updatedAt: 0,
  })),
  forgetMemory: vi.fn(async () => {}),
  authProviders: vi.fn(async () => ({ google: false })),
  me: vi.fn(async () => ({ user: null, connections: { google: false } })),
  listIntegrations: vi.fn(async () => []),
  logout: vi.fn(async () => {}),
});

describe('useAgentRun', () => {
  it('folds streamed events into transcript state', async () => {
    const client = fakeClient([
      { type: 'run_started', runId: 'r1', conversationId: 'c1' },
      { type: 'message', delta: 'Hello there' },
      { type: 'done', reason: 'completed' },
    ]);
    const { result } = renderHook(() => useAgentRun(client));

    await act(async () => {
      await result.current.submit('hi');
    });

    await waitFor(() => expect(result.current.state.status).toBe('done'));
    const kinds = result.current.state.items.map((i) => i.kind);
    expect(kinds).toEqual(['user', 'assistant']);
    expect(result.current.state.runId).toBe('r1');
  });

  it('routes approvals through the client using the run id', async () => {
    const client = fakeClient([
      { type: 'run_started', runId: 'r9', conversationId: 'c1' },
      { type: 'approval_required', id: 'a1', summary: 'Write file', target: 'a.ts' },
      { type: 'done', reason: 'completed' },
    ]);
    const { result } = renderHook(() => useAgentRun(client));

    await act(async () => {
      await result.current.submit('edit it');
    });
    await act(async () => {
      await result.current.approve('a1', true);
    });

    expect(client.resolveApproval).toHaveBeenCalledWith('r9', 'a1', true);
    const approval = result.current.state.items.find((i) => i.kind === 'approval');
    expect(approval?.kind === 'approval' && approval.status).toBe('approved');
  });

  it('reset clears the transcript', async () => {
    const client = fakeClient([{ type: 'done', reason: 'completed' }]);
    const { result } = renderHook(() => useAgentRun(client));
    await act(async () => {
      await result.current.submit('hi');
    });
    act(() => result.current.reset());
    expect(result.current.state.items).toHaveLength(0);
    expect(result.current.state.status).toBe('idle');
  });
});
