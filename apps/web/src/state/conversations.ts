import {
  initialRunState,
  runReducer,
  type RunAction,
  type RunState,
  type TranscriptItem,
} from './transcript.ts';

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly state: RunState;
  readonly updatedAt: number;
}

export interface ChatState {
  readonly conversations: readonly Conversation[];
  readonly activeId: string;
}

export const newConversationId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}`;

const titleFrom = (items: readonly TranscriptItem[]): string => {
  const firstUser = items.find((i) => i.kind === 'user');
  if (firstUser && firstUser.kind === 'user') {
    const t = firstUser.text.trim().replace(/\s+/g, ' ');
    return t.length > 42 ? `${t.slice(0, 42)}…` : t || 'New chat';
  }
  return 'New chat';
};

const emptyConversation = (id: string): Conversation => ({
  id,
  title: 'New chat',
  state: initialRunState,
  updatedAt: 0,
});

export type ChatAction =
  | { readonly type: 'select'; readonly id: string }
  | { readonly type: 'new'; readonly id: string }
  | { readonly type: 'remove'; readonly id: string; readonly fallbackId: string }
  | { readonly type: 'run'; readonly id: string; readonly action: RunAction; readonly now: number };

export const chatReducer = (state: ChatState, action: ChatAction): ChatState => {
  switch (action.type) {
    case 'select':
      return state.conversations.some((c) => c.id === action.id)
        ? { ...state, activeId: action.id }
        : state;

    case 'new':
      return {
        conversations: [emptyConversation(action.id), ...state.conversations],
        activeId: action.id,
      };

    case 'remove': {
      const remaining = state.conversations.filter((c) => c.id !== action.id);
      const conversations =
        remaining.length > 0 ? remaining : [emptyConversation(action.fallbackId)];
      const activeId =
        state.activeId === action.id ? (conversations[0]?.id ?? action.fallbackId) : state.activeId;
      return { conversations, activeId };
    }

    case 'run': {
      const conversations = state.conversations.map((c) => {
        if (c.id !== action.id) return c;
        const nextState = runReducer(c.state, action.action);
        return {
          ...c,
          state: nextState,
          title: c.title === 'New chat' ? titleFrom(nextState.items) : c.title,
          updatedAt: action.now,
        };
      });
      return { ...state, conversations };
    }

    default:
      return state;
  }
};

/* ---------- persistence (localStorage) ---------- */

const KEY = 'fw_conversations';

interface PersistedConversation {
  readonly id: string;
  readonly title: string;
  readonly items: readonly TranscriptItem[];
  readonly updatedAt: number;
}

export const loadChatState = (): ChatState => {
  const fresh = (): ChatState => {
    const id = newConversationId();
    return { conversations: [emptyConversation(id)], activeId: id };
  };
  if (typeof localStorage === 'undefined') return fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const parsed = JSON.parse(raw) as PersistedConversation[];
    if (!Array.isArray(parsed) || parsed.length === 0) return fresh();
    const conversations: Conversation[] = parsed.map((p) => ({
      id: p.id,
      title: p.title,
      updatedAt: p.updatedAt,
      state: { ...initialRunState, items: p.items },
    }));
    return { conversations, activeId: conversations[0]?.id ?? newConversationId() };
  } catch {
    return fresh();
  }
};

export const saveChatState = (conversations: readonly Conversation[]): void => {
  if (typeof localStorage === 'undefined') return;
  const persisted: PersistedConversation[] = conversations
    .filter((c) => c.state.items.length > 0)
    .map((c) => ({ id: c.id, title: c.title, items: c.state.items, updatedAt: c.updatedAt }));
  try {
    localStorage.setItem(KEY, JSON.stringify(persisted));
  } catch {
    // storage full / unavailable — ignore
  }
};
