import { useCallback, useEffect, useState } from 'react';

import type { Memory } from '@forgewright/types';

import type { ForgewrightClient } from '../api/client.ts';

const KIND_COLOR: Record<string, string> = {
  preference: 'text-accent',
  decision: 'text-success',
  'recurring-bug': 'text-danger',
  todo: 'text-warning',
  conversation: 'text-muted',
  summary: 'text-slate-300',
};

export const MemoryPanel = ({ client }: { client: ForgewrightClient }): JSX.Element => {
  const [memories, setMemories] = useState<readonly Memory[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result =
        query.trim() === '' ? await client.listMemories() : await client.searchMemories(query, 10);
      setMemories(result);
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, [client, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const forget = async (id: string): Promise<void> => {
    await client.forgetMemory(id);
    void load();
  };

  const remember = async (): Promise<void> => {
    const content = draft.trim();
    if (content === '') return;
    setDraft('');
    await client.addMemory({ kind: 'preference', content });
    void load();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Memory</h2>
          <p className="text-[11px] leading-snug text-muted">
            What the assistant remembers across <em>all</em> chats — preferences, decisions, bugs.
            (Conversations themselves live in the left sidebar.)
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memory…"
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-slate-100 placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void remember();
            }}
            placeholder="Teach it a fact to remember…"
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm text-slate-100 placeholder:text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void remember()}
            disabled={draft.trim() === ''}
            className="shrink-0 rounded-md bg-accent px-2.5 text-xs font-medium text-surface disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-auto p-3">
        {loading ? <p className="text-xs text-muted">Loading…</p> : null}
        {!loading && memories.length === 0 ? (
          <p className="text-xs text-muted">
            Nothing remembered yet. Add a fact above (e.g. “I prefer tabs over spaces”) and the
            assistant will recall it in future chats.
          </p>
        ) : null}
        {memories.map((m) => (
          <div key={m.id} className="group rounded-md border border-border bg-surface/60 p-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${KIND_COLOR[m.kind] ?? 'text-muted'}`}>
                {m.kind}
              </span>
              <button
                type="button"
                onClick={() => void forget(m.id)}
                className="ml-auto text-xs text-muted opacity-0 transition group-hover:opacity-100 hover:text-danger"
                aria-label="Forget memory"
              >
                forget
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-300">{m.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
