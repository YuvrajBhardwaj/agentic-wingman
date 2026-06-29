import { describe, expect, it } from 'vitest';

import { chatReducer, type ChatState } from './conversations.ts';
import { initialRunState } from './transcript.ts';

const seed = (): ChatState => ({
  conversations: [{ id: 'a', title: 'New chat', state: initialRunState, updatedAt: 0 }],
  activeId: 'a',
});

describe('chatReducer', () => {
  it('creates a new conversation and makes it active', () => {
    const next = chatReducer(seed(), { type: 'new', id: 'b' });
    expect(next.activeId).toBe('b');
    expect(next.conversations).toHaveLength(2);
    expect(next.conversations[0]?.id).toBe('b'); // newest first
  });

  it('routes run actions to the target conversation and titles it', () => {
    let state = chatReducer(seed(), { type: 'new', id: 'b' });
    state = chatReducer(state, {
      type: 'run',
      id: 'b',
      action: { type: 'submit', text: 'Refactor the auth module please' },
      now: 5,
    });
    const conv = state.conversations.find((c) => c.id === 'b');
    expect(conv?.state.items[0]).toMatchObject({ kind: 'user' });
    expect(conv?.title).toBe('Refactor the auth module please');
    // The other conversation is untouched.
    expect(state.conversations.find((c) => c.id === 'a')?.state.items).toHaveLength(0);
  });

  it('selects an existing conversation', () => {
    const state = chatReducer(seed(), { type: 'new', id: 'b' });
    expect(chatReducer(state, { type: 'select', id: 'a' }).activeId).toBe('a');
    expect(chatReducer(state, { type: 'select', id: 'ghost' }).activeId).toBe('b'); // unchanged
  });

  it('removes a conversation, keeping at least one', () => {
    const two = chatReducer(seed(), { type: 'new', id: 'b' });
    const afterRemove = chatReducer(two, { type: 'remove', id: 'b', fallbackId: 'x' });
    expect(afterRemove.conversations.map((c) => c.id)).toEqual(['a']);
    expect(afterRemove.activeId).toBe('a');

    const removeLast = chatReducer(seed(), { type: 'remove', id: 'a', fallbackId: 'x' });
    expect(removeLast.conversations).toHaveLength(1);
    expect(removeLast.conversations[0]?.id).toBe('x');
  });
});
