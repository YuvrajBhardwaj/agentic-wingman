import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { captureSessionFromUrl } from './api/auth.ts';
import { createClient } from './api/client.ts';
import { CommandPalette, type Command } from './components/CommandPalette.tsx';
import { Composer } from './components/Composer.tsx';
import { ConnectionsPanel } from './components/ConnectionsPanel.tsx';
import { MemoryPanel } from './components/MemoryPanel.tsx';
import { Transcript } from './components/Transcript.tsx';
import { useAgentRun } from './hooks/useAgentRun.ts';

// Capture an OAuth session token from the callback redirect before first render.
captureSessionFromUrl();

const newConversationId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}`;

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
  const [conversationId, setConversationId] = useState(newConversationId);
  const run = useAgentRun(client, conversationId);

  const [memoryVersion, setMemoryVersion] = useState(0);
  const [showMemory, setShowMemory] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  useEffect(() => {
    if (run.state.status === 'done') setMemoryVersion((v) => v + 1);
  }, [run.state.status]);

  const newChat = (): void => {
    run.reset();
    setConversationId(newConversationId());
  };

  const commands: Command[] = [
    { id: 'new-chat', label: 'New chat', hint: 'reset conversation', run: newChat },
    { id: 'stop', label: 'Stop the current run', run: run.abort },
    {
      id: 'toggle-memory',
      label: showMemory ? 'Hide memory panel' : 'Show memory panel',
      run: () => setShowMemory((v) => !v),
    },
    { id: 'connections', label: 'Connect accounts (Google, messaging)', run: () => setConnectionsOpen(true) },
    { id: 'refresh-memory', label: 'Refresh memory panel', run: () => setMemoryVersion((v) => v + 1) },
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

  return (
    <div className="flex h-full flex-col bg-surface">
      <CommandPalette open={paletteOpen} commands={commands} onClose={() => setPaletteOpen(false)} />
      {connectionsOpen ? (
        <ConnectionsPanel client={client} onClose={() => setConnectionsOpen(false)} />
      ) : null}

      <header className="z-10 flex items-center gap-3 border-b border-border bg-panel/70 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#cba6f7] text-xs font-bold text-surface">
            F
          </div>
          <span className="text-sm font-semibold text-slate-100">Forgewright</span>
          <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            agent
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {run.state.usage ? (
            <span className="hidden text-xs text-muted sm:inline">
              {run.state.usage.totalTokens.toLocaleString()} tokens
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
          <IconButton label="New chat" onClick={newChat}>
            New chat
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto">
            <Transcript
              items={run.state.items}
              isRunning={run.isRunning}
              onApprove={(id, approved) => void run.approve(id, approved)}
              onSuggest={(text) => void run.submit(text)}
            />
          </div>
          <Composer
            isRunning={run.isRunning}
            onSubmit={(text) => void run.submit(text)}
            onStop={run.abort}
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
