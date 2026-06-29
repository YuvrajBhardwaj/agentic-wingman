import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';

export interface Command {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  run(): void;
}

export const CommandPalette = ({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: readonly Command[];
  onClose: () => void;
}): JSX.Element | null => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const filtered = useMemo(
    () => commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query],
  );

  useEffect(() => {
    setIndex(0);
  }, [query, open]);

  if (!open) return null;

  const execute = (command: Command): void => {
    onClose();
    command.run();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const command = filtered[index];
      if (command) execute(command);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-24"
      onClick={onClose}
    >
      <div
        className="w-[32rem] overflow-hidden rounded-xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-slate-100 placeholder:text-muted focus:outline-none"
        />
        <ul className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-2 text-sm text-muted">No matching commands</li>
          ) : (
            filtered.map((command, i) => (
              <li key={command.id}>
                <button
                  type="button"
                  aria-selected={i === index}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => execute(command)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                    i === index ? 'bg-accent/20 text-slate-100' : 'text-slate-300'
                  }`}
                >
                  <span>{command.label}</span>
                  {command.hint ? <span className="text-xs text-muted">{command.hint}</span> : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
};
