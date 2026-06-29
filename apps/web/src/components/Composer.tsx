import { useState, type KeyboardEvent } from 'react';

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
    <div className="flex items-end gap-2 border-t border-border bg-panel p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Ask Forgewright to change your code…  (Enter to send, Shift+Enter for newline)"
        className="min-h-[44px] flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {isRunning ? (
        <button
          type="button"
          onClick={onStop}
          className="rounded-lg bg-danger/20 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/30"
        >
          Stop
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={text.trim() === ''}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-surface disabled:opacity-40"
        >
          Send
        </button>
      )}
    </div>
  );
};
