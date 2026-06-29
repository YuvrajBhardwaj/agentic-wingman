import { useEffect, useMemo, useRef, useState } from 'react';

import { createClient } from './api/client.ts';
import { CommandPalette, type Command } from './components/CommandPalette.tsx';
import { Composer } from './components/Composer.tsx';
import { MemoryPanel } from './components/MemoryPanel.tsx';
import { Transcript } from './components/Transcript.tsx';
import { useAgentRun } from './hooks/useAgentRun.ts';

const newConversationId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `c-${Date.now()}`;

export const App = (): JSX.Element => {
  const client = useMemo(() => createClient(), []);
  const [conversationId, setConversationId] = useState(newConversationId);
  const run = useAgentRun(client, conversationId);

  const [sidebarWidth, setSidebarWidth] = useState(320);
  const [memoryVersion, setMemoryVersion] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const draggingRef = useRef(false);

  // Refresh the memory panel whenever a run completes (auto-capture happened).
  useEffect(() => {
    if (run.state.status === 'done') setMemoryVersion((v) => v + 1);
  }, [run.state.status]);

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!draggingRef.current) return;
      const width = Math.min(560, Math.max(220, window.innerWidth - e.clientX));
      setSidebarWidth(width);
    };
    const onUp = (): void => {
      draggingRef.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const newChat = (): void => {
    run.reset();
    setConversationId(newConversationId());
  };

  const commands: Command[] = [
    { id: 'new-chat', label: 'New chat', hint: 'reset conversation', run: newChat },
    { id: 'stop', label: 'Stop the current run', run: run.abort },
    {
      id: 'refresh-memory',
      label: 'Refresh memory panel',
      run: () => setMemoryVersion((v) => v + 1),
    },
  ];

  // Ctrl/Cmd+K toggles the command palette.
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
      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <header className="flex items-center gap-3 border-b border-border bg-panel px-4 py-2">
        <span className="text-sm font-semibold text-slate-100">
          Forge<span className="text-accent">wright</span>
        </span>
        <span className="rounded bg-elevated px-2 py-0.5 text-xs text-muted">local</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted">
          {run.state.usage ? <span>{run.state.usage.totalTokens} tokens</span> : null}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="rounded-md border border-border px-2 py-1 text-slate-300 hover:bg-elevated"
          >
            ⌘K
          </button>
          <button
            type="button"
            onClick={newChat}
            className="rounded-md border border-border px-2 py-1 text-slate-300 hover:bg-elevated"
          >
            New chat
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto p-4">
            <Transcript
              items={run.state.items}
              onApprove={(id, approved) => void run.approve(id, approved)}
            />
          </div>
          <Composer
            isRunning={run.isRunning}
            onSubmit={(text) => void run.submit(text)}
            onStop={run.abort}
          />
        </main>

        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={() => {
            draggingRef.current = true;
          }}
          className="w-1 cursor-col-resize bg-border hover:bg-accent"
        />

        <aside style={{ width: sidebarWidth }} className="shrink-0 border-l border-border bg-panel">
          <MemoryPanel key={memoryVersion} client={client} />
        </aside>
      </div>
    </div>
  );
};
