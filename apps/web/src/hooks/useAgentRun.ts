import { useCallback, useMemo, useReducer, useRef } from 'react';

import type { ForgewrightClient } from '../api/client.ts';
import { initialRunState, runReducer, type RunState } from '../state/transcript.ts';

export interface UseAgentRun {
  readonly state: RunState;
  readonly isRunning: boolean;
  submit(input: string): Promise<void>;
  approve(approvalId: string, approved: boolean): Promise<void>;
  abort(): void;
  reset(): void;
}

/**
 * Drives an agent run: dispatches streamed events into the transcript reducer
 * and exposes submit / approve / abort. The client is injectable for tests.
 */
export const useAgentRun = (client: ForgewrightClient, conversationId?: string): UseAgentRun => {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const abortRef = useRef<AbortController | null>(null);

  const submit = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (trimmed === '') return;
      dispatch({ type: 'submit', text: trimmed });

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await client.runAgent({
          input: trimmed,
          ...(conversationId ? { conversationId } : {}),
          signal: controller.signal,
          onEvent: (event) => dispatch({ type: 'event', event }),
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          dispatch({
            type: 'event',
            event: {
              type: 'error',
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      } finally {
        abortRef.current = null;
      }
    },
    [client, conversationId],
  );

  const approve = useCallback(
    async (approvalId: string, approved: boolean) => {
      const runId = state.runId;
      if (!runId) return;
      await client.resolveApproval(runId, approvalId, approved);
      dispatch({ type: 'approvalResolved', approvalId, approved });
    },
    [client, state.runId],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'reset' });
  }, []);

  return useMemo(
    () => ({ state, isRunning: state.status === 'running', submit, approve, abort, reset }),
    [state, submit, approve, abort, reset],
  );
};
