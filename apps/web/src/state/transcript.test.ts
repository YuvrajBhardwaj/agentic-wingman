import { describe, expect, it } from 'vitest';

import type { AppEvent } from '../api/events.ts';

import { initialRunState, runReducer, type RunState } from './transcript.ts';

const drive = (events: readonly AppEvent[], from: RunState = initialRunState): RunState =>
  events.reduce((state, event) => runReducer(state, { type: 'event', event }), from);

describe('runReducer', () => {
  it('accumulates streamed assistant text into one bubble', () => {
    const state = drive([
      { type: 'run_started', runId: 'r1', conversationId: 'c1' },
      { type: 'step', index: 0, maxSteps: 12 },
      { type: 'message', delta: 'Hello' },
      { type: 'message', delta: ', world' },
      { type: 'done', reason: 'completed' },
    ]);
    const assistant = state.items.filter((i) => i.kind === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.kind === 'assistant' && assistant[0].text).toBe('Hello, world');
    expect(state.status).toBe('done');
    expect(state.runId).toBe('r1');
  });

  it('tracks a tool call then its result', () => {
    const state = drive([
      { type: 'tool_call', id: 't1', name: 'write_file', input: { path: 'a.ts' } },
      { type: 'tool_result', id: 't1', output: { created: true }, isError: false },
    ]);
    const tool = state.items.find((i) => i.kind === 'tool');
    expect(tool?.kind === 'tool' && tool.name).toBe('write_file');
    expect(tool?.kind === 'tool' && tool.status).toBe('done');
    expect(tool?.kind === 'tool' && tool.output).toEqual({ created: true });
  });

  it('starts a new assistant bubble after a tool call', () => {
    const state = drive([
      { type: 'message', delta: 'Let me edit that.' },
      { type: 'tool_call', id: 't1', name: 'write_file', input: {} },
      { type: 'tool_result', id: 't1', output: {}, isError: false },
      { type: 'step', index: 1, maxSteps: 12 },
      { type: 'message', delta: 'Done.' },
    ]);
    const assistant = state.items.filter((i) => i.kind === 'assistant');
    expect(assistant).toHaveLength(2);
  });

  it('records an approval and resolves it', () => {
    let state = drive([
      { type: 'approval_required', id: 'a1', summary: 'Write a.ts', target: 'a.ts' },
    ]);
    expect(state.items[0]?.kind === 'approval' && state.items[0].status).toBe('pending');
    state = runReducer(state, { type: 'approvalResolved', approvalId: 'a1', approved: true });
    expect(state.items[0]?.kind === 'approval' && state.items[0].status).toBe('approved');
  });

  it('captures usage and errors', () => {
    const state = drive([
      { type: 'usage', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
      { type: 'error', message: 'boom' },
    ]);
    expect(state.usage?.totalTokens).toBe(15);
    expect(state.items.some((i) => i.kind === 'error')).toBe(true);
    expect(state.status).toBe('done');
  });

  it('submit adds a user bubble and sets running', () => {
    const state = runReducer(initialRunState, { type: 'submit', text: 'do a thing' });
    expect(state.items[0]).toMatchObject({ kind: 'user', text: 'do a thing' });
    expect(state.status).toBe('running');
  });
});
