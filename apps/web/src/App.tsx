import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { captureSessionFromUrl } from './api/auth.ts';
import { createClient } from './api/client.ts';
import { CommandPalette, type Command } from './components/CommandPalette.tsx';
import { Composer } from './components/Composer.tsx';
import { ConnectionsPanel } from './components/ConnectionsPanel.tsx';
import { ConversationSidebar } from './components/ConversationSidebar.tsx';
import { MemoryPanel } from './components/MemoryPanel.tsx';
import { Transcript } from './components/Transcript.tsx';
import { useChat } from './hooks/useChat.ts';

// Capture an OAuth session token from the callback redirect before first render.
captureSessionFromUrl();

const IconButton = ({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    aria-label={label}
    className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition ${
      active
        ? 'border-accent/40 bg-accent/10 text-accent'
        : 'border-border text-slate-300 hover:bg-elevated'
    }`}
  >
    {children}
  </button>
);

export const App = (): JSX.Element => {
  const client = useMemo(() => createClient(), []);
  const chat = useChat(client);

  const [memoryVersion, setMemoryVersion] = useState(0);
  const [showMemory, setShowMemory] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const status = chat.active?.state.status;
  useEffect(() => {
    if (status === 'done') setMemoryVersion((v) => v + 1);
  }, [status]);

  const commands: Command[] = [
    { id: 'new-chat', label: 'New chat', hint: 'start a session', run: chat.newChat },
    { id: 'stop', label: 'Stop the current run', run: chat.abort },
    {
      id: 'toggle-sidebar',
      label: showSidebar ? 'Hide conversations' : 'Show conversations',
      run: () => setShowSidebar((v) => !v),
    },
    {
      id: 'toggle-memory',
      label: showMemory ? 'Hide memory panel' : 'Show memory panel',
      run: () => setShowMemory((v) => !v),
    },
    {
      id: 'connections',
      label: 'Connect accounts (Google, messaging)',
      run: () => setConnectionsOpen(true),
    },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const usage = chat.active?.state.usage;

  return (
    <div className="flex h-full flex-col bg-surface">
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      {connectionsOpen ? (
        <ConnectionsPanel client={client} onClose={() => setConnectionsOpen(false)} />
      ) : null}

      <header className="z-10 flex items-center gap-3 border-b border-border bg-panel/70 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => setShowSidebar((v) => !v)}
          aria-label="Toggle conversations"
          className="rounded-lg p-1.5 text-muted transition hover:bg-elevated hover:text-slate-200"
        >
          <svg
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <rect x="3" y="4" width="14" height="12" rx="2" />
            <path d="M8 4v12" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#cba6f7] text-xs font-bold text-surface">
            F
          </div>
          <span className="text-sm font-semibold text-slate-100">Forgewright</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {usage ? (
            <span className="hidden text-xs text-muted sm:inline">
              {usage.totalTokens.toLocaleString()} tokens
            </span>
          ) : null}
          <IconButton label="Connect accounts" onClick={() => setConnectionsOpen(true)}>
            Connect
          </IconButton>
          <IconButton label="Command palette" onClick={() => setPaletteOpen(true)}>
            ⌘K
          </IconButton>
          <IconButton
            label="Toggle memory"
            onClick={() => setShowMemory((v) => !v)}
            active={showMemory}
          >
            Memory
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {showSidebar ? (
          <aside className="hidden w-64 shrink-0 border-r border-border bg-panel/40 md:block">
            <ConversationSidebar
              conversations={chat.conversations}
              activeId={chat.activeId}
              onSelect={chat.select}
              onNew={chat.newChat}
              onRemove={chat.remove}
            />
          </aside>
        ) : null}

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <Transcript
              items={chat.active?.state.items ?? []}
              isRunning={chat.isRunning}
              onApprove={(id, approved) => void chat.approve(id, approved)}
              onSuggest={(text) => void chat.submit(text)}
            />
          </div>
          <Composer
            isRunning={chat.isRunning}
            onSubmit={(text) => void chat.submit(text)}
            onStop={chat.abort}
          />
        </main>

        {showMemory ? (
          <aside className="hidden w-80 shrink-0 border-l border-border bg-panel/40 lg:block">
            <MemoryPanel key={memoryVersion} client={client} />
          </aside>
        ) : null}
      </div>
    </div>
  );
};
