import type { TokenUsage } from '@forgewright/types';

import type { AppEvent } from '../api/events.ts';

export type ToolStatus = 'running' | 'done' | 'error';
export type ApprovalStatus = 'pending' | 'approved' | 'denied';

export type TranscriptItem =
  | { readonly id: string; readonly kind: 'user'; readonly text: string }
  | { readonly id: string; readonly kind: 'assistant'; readonly text: string }
  | {
      readonly id: string;
      readonly kind: 'tool';
      readonly toolId: string;
      readonly name: string;
      readonly input: unknown;
      readonly status: ToolStatus;
      readonly output?: unknown;
    }
  | {
      readonly id: string;
      readonly kind: 'approval';
      readonly approvalId: string;
      readonly summary: string;
      readonly target?: string;
      readonly status: ApprovalStatus;
    }
  | { readonly id: string; readonly kind: 'error'; readonly message: string };

export type RunStatus = 'idle' | 'running' | 'done';

export interface RunState {
  readonly items: readonly TranscriptItem[];
  readonly runId: string | undefined;
  readonly status: RunStatus;
  readonly usage: TokenUsage | undefined;
  readonly seq: number;
  /** Id of the assistant bubble currently being appended to, if any. */
  readonly openAssistantId: string | undefined;
}

export const initialRunState: RunState = {
  items: [],
  runId: undefined,
  status: 'idle',
  usage: undefined,
  seq: 0,
  openAssistantId: undefined,
};

export type RunAction =
  | { readonly type: 'submit'; readonly text: string }
  | { readonly type: 'event'; readonly event: AppEvent }
  | { readonly type: 'approvalResolved'; readonly approvalId: string; readonly approved: boolean }
  | { readonly type: 'reset' };

const nextId = (state: RunState): [string, number] => [`i${state.seq}`, state.seq + 1];

export const runReducer = (state: RunState, action: RunAction): RunState => {
  switch (action.type) {
    case 'reset':
      return initialRunState;

    case 'submit': {
      const [id, seq] = nextId(state);
      return {
        ...state,
        seq,
        status: 'running',
        usage: undefined,
        openAssistantId: undefined,
        items: [...state.items, { id, kind: 'user', text: action.text }],
      };
    }

    case 'approvalResolved':
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'approval' && item.approvalId === action.approvalId
            ? { ...item, status: action.approved ? 'approved' : 'denied' }
            : item,
        ),
      };

    case 'event':
      return applyEvent(state, action.event);

    default:
      return state;
  }
};

const applyEvent = (state: RunState, event: AppEvent): RunState => {
  switch (event.type) {
    case 'run_started':
      return { ...state, runId: event.runId, status: 'running' };

    case 'step':
      return { ...state, openAssistantId: undefined };

    case 'message': {
      if (state.openAssistantId) {
        return {
          ...state,
          items: state.items.map((item) =>
            item.id === state.openAssistantId && item.kind === 'assistant'
              ? { ...item, text: item.text + event.delta }
              : item,
          ),
        };
      }
      const [id, seq] = nextId(state);
      return {
        ...state,
        seq,
        openAssistantId: id,
        items: [...state.items, { id, kind: 'assistant', text: event.delta }],
      };
    }

    case 'tool_call': {
      const [id, seq] = nextId(state);
      return {
        ...state,
        seq,
        openAssistantId: undefined,
        items: [
          ...state.items,
          {
            id,
            kind: 'tool',
            toolId: event.id,
            name: event.name,
            input: event.input,
            status: 'running',
          },
        ],
      };
    }

    case 'tool_result':
      return {
        ...state,
        items: state.items.map((item) =>
          item.kind === 'tool' && item.toolId === event.id
            ? { ...item, status: event.isError ? 'error' : 'done', output: event.output }
            : item,
        ),
      };

    case 'approval_required': {
      const [id, seq] = nextId(state);
      return {
        ...state,
        seq,
        items: [
          ...state.items,
          {
            id,
            kind: 'approval',
            approvalId: event.id,
            summary: event.summary,
            ...(event.target !== undefined ? { target: event.target } : {}),
            status: 'pending',
          },
        ],
      };
    }

    case 'usage':
      return { ...state, usage: event.usage };

    case 'done':
      return { ...state, status: 'done', openAssistantId: undefined };

    case 'error': {
      const [id, seq] = nextId(state);
      return {
        ...state,
        seq,
        status: 'done',
        items: [...state.items, { id, kind: 'error', message: event.message }],
      };
    }

    default:
      return state;
  }
};
