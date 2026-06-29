import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import type { ForgewrightClient } from '../api/client.ts';
import {
  chatReducer,
  loadChatState,
  newConversationId,
  saveChatState,
  type Conversation,
} from '../state/conversations.ts';

export interface UseChat {
  readonly conversations: readonly Conversation[];
  readonly activeId: string;
  readonly active: Conversation | undefined;
  readonly isRunning: boolean;
  submit(input: string): Promise<void>;
  approve(approvalId: string, approved: boolean): Promise<void>;
  abort(): void;
  newChat(): void;
  select(id: string): void;
  remove(id: string): void;
}

/**
 * Manages multiple persisted conversations (ChatGPT-style sessions). The active
 * conversation's transcript is updated from streamed agent events; switching
 * conversations swaps which transcript is shown, and history is sent server-side
 * for multi-turn continuity.
 */
export const useChat = (client: ForgewrightClient): UseChat => {
  const [state, dispatch] = useReducer(chatReducer, undefined, loadChatState);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    saveChatState(state.conversations);
  }, [state.conversations]);

  const active = state.conversations.find((c) => c.id === state.activeId);

  const submit = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (trimmed === '') return;
      const id = state.activeId;
      dispatch({ type: 'run', id, action: { type: 'submit', text: trimmed }, now: Date.now() });

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await client.runAgent({
          input: trimmed,
          conversationId: id,
          signal: controller.signal,
          onEvent: (event) =>
            dispatch({ type: 'run', id, action: { type: 'event', event }, now: Date.now() }),
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'run',
            id,
            action: {
              type: 'event',
              event: {
                type: 'error',
                message: error instanceof Error ? error.message : String(error),
              },
            },
            now: Date.now(),
          });
        }
      } finally {
        abortRef.current = null;
      }
    },
    [client, state.activeId],
  );

  const approve = useCallback(
    async (approvalId: string, approved: boolean) => {
      const id = state.activeId;
      const runId = state.conversations.find((c) => c.id === id)?.state.runId;
      if (!runId) return;
      await client.resolveApproval(runId, approvalId, approved);
      dispatch({
        type: 'run',
        id,
        action: { type: 'approvalResolved', approvalId, approved },
        now: Date.now(),
      });
    },
    [client, state.activeId, state.conversations],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'new', id: newConversationId() });
  }, []);

  const select = useCallback((id: string) => dispatch({ type: 'select', id }), []);
  const remove = useCallback(
    (id: string) => dispatch({ type: 'remove', id, fallbackId: newConversationId() }),
    [],
  );

  return useMemo(
    () => ({
      conversations: state.conversations,
      activeId: state.activeId,
      active,
      isRunning: active?.state.status === 'running',
      submit,
      approve,
      abort,
      newChat,
      select,
      remove,
    }),
    [state.conversations, state.activeId, active, submit, approve, abort, newChat, select, remove],
  );
};
