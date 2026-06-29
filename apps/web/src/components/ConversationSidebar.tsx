import type { Conversation } from '../state/conversations.ts';

const PlusIcon = (): JSX.Element => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 4v12M4 10h12" strokeLinecap="round" />
  </svg>
);

export const ConversationSidebar = ({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRemove,
}: {
  conversations: readonly Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRemove: (id: string) => void;
}): JSX.Element => (
  <div className="flex h-full flex-col">
    <div className="p-3">
      <button
        type="button"
        onClick={onNew}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent to-[#cba6f7] px-3 py-2 text-sm font-medium text-surface shadow transition hover:opacity-90"
      >
        <PlusIcon />
        New chat
      </button>
    </div>
    <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
      <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
        Conversations
      </p>
      {conversations.map((c) => (
        <div
          key={c.id}
          className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
            c.id === activeId ? 'bg-elevated text-slate-100' : 'text-slate-300 hover:bg-elevated/60'
          }`}
        >
          <button
            type="button"
            onClick={() => onSelect(c.id)}
            className="min-w-0 flex-1 truncate text-left"
            title={c.title}
          >
            {c.title}
          </button>
          <button
            type="button"
            onClick={() => onRemove(c.id)}
            aria-label="Delete conversation"
            className="shrink-0 text-xs text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  </div>
);
