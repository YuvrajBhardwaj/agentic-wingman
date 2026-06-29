import type { AgentEvent } from '@forgewright/types';

export interface RunStartedEvent {
  readonly type: 'run_started';
  readonly runId: string;
  readonly conversationId: string;
}

export interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
}

/** Every event the server can stream over the agent SSE channel. */
export type AppEvent = AgentEvent | RunStartedEvent | ErrorEvent;
