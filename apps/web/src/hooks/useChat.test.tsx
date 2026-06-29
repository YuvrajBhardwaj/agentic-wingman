import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ForgewrightClient } from '../api/client.ts';
import type { AppEvent } from '../api/events.ts';

import { useChat } from './useChat.ts';

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

beforeEach(() => localStorage.clear());

describe('useChat', () => {
  it('starts with one empty conversation', () => {
    const { result } = renderHook(() => useChat(fakeClient([])));
    expect(result.current.conversations).toHaveLength(1);
    expect(result.current.active?.state.items).toHaveLength(0);
  });

  it('folds a streamed run into the active conversation and titles it', async () => {
    const client = fakeClient([
      { type: 'run_started', runId: 'r1', conversationId: 'c1' },
      { type: 'message', delta: 'Hi there' },
      { type: 'done', reason: 'completed' },
    ]);
    const { result } = renderHook(() => useChat(client));
    await act(async () => {
      await result.current.submit('Hello agent');
    });
    await waitFor(() => expect(result.current.active?.state.status).toBe('done'));
    const kinds = result.current.active?.state.items.map((i) => i.kind);
    expect(kinds).toEqual(['user', 'assistant']);
    expect(result.current.active?.title).toBe('Hello agent');
  });

  it('keeps separate transcripts per conversation', async () => {
    const client = fakeClient([
      { type: 'message', delta: 'A' },
      { type: 'done', reason: 'completed' },
    ]);
    const { result } = renderHook(() => useChat(client));
    await act(async () => {
      await result.current.submit('first chat');
    });
    act(() => result.current.newChat());
    expect(result.current.active?.state.items).toHaveLength(0); // new chat is empty
    expect(result.current.conversations).toHaveLength(2);
  });

  it('routes approvals through the client with the run id', async () => {
    const client = fakeClient([
      { type: 'run_started', runId: 'r9', conversationId: 'c1' },
      { type: 'approval_required', id: 'a1', summary: 'Write', target: 'a.ts' },
      { type: 'done', reason: 'completed' },
    ]);
    const { result } = renderHook(() => useChat(client));
    await act(async () => {
      await result.current.submit('edit it');
    });
    await act(async () => {
      await result.current.approve('a1', true);
    });
    expect(client.resolveApproval).toHaveBeenCalledWith('r9', 'a1', true);
  });
});
