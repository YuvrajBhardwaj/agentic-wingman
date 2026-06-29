import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

const ArrowUp = (): JSX.Element => (
  <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 16V4M10 4l-5 5M10 4l5 5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const StopIcon = (): JSX.Element => (
  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
    <rect x="5" y="5" width="10" height="10" rx="2" />
  </svg>
);

export const Composer = ({
  onSubmit,
  onStop,
  isRunning,
}: {
  onSubmit: (text: string) => void;
  onStop: () => void;
  isRunning: boolean;
}): JSX.Element => {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const submit = (): void => {
    if (text.trim() === '' || isRunning) return;
    onSubmit(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-panel p-2 shadow-lg transition focus-within:border-accent/60 focus-within:shadow-accent/5">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask Forgewright to explain, search, or change your code…"
            className="max-h-[200px] flex-1 resize-none bg-transparent px-3 py-2 text-[15px] leading-6 text-slate-100 placeholder:text-muted focus:outline-none"
          />
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/20 text-danger transition hover:bg-danger/30"
            >
              <StopIcon />
              <span className="sr-only">Stop</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={text.trim() === ''}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-surface transition enabled:hover:bg-accent-strong disabled:opacity-30"
            >
              <ArrowUp />
              <span className="sr-only">Send</span>
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Enter to send · Shift+Enter for a new line · ⌘K for commands
        </p>
      </div>
    </div>
  );
};
