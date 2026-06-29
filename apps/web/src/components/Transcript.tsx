import { useEffect, useRef } from 'react';

import type { TranscriptItem } from '../state/transcript.ts';

import { ApprovalPrompt } from './ApprovalPrompt.tsx';
import { Message } from './Message.tsx';
import { ToolCallCard } from './ToolCallCard.tsx';

const SUGGESTIONS = [
  'Explain the architecture of this project',
  'Find where errors are handled and summarize the approach',
  'Add a health check endpoint and a test for it',
  'What are the main risks in this codebase?',
];

const ThinkingRow = (): JSX.Element => (
  <div className="flex gap-3">
    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-[#cba6f7] text-xs font-bold text-surface">
      F
    </div>
    <div className="flex items-center gap-1.5 pt-2">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </div>
  </div>
);

const EmptyState = ({ onSuggest }: { onSuggest?: (text: string) => void }): JSX.Element => (
  <div className="flex h-full flex-col items-center justify-center px-4 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-[#cba6f7] text-2xl font-bold text-surface shadow-lg">
      F
    </div>
    <h1 className="text-2xl font-semibold text-slate-100">Forgewright</h1>
    <p className="mt-1.5 max-w-md text-sm text-muted">
      Your AI engineering companion — it reads your repo, remembers, plans, and edits with your
      approval.
    </p>
    <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onSuggest?.(s)}
          className="rounded-xl border border-border bg-panel/60 px-4 py-3 text-left text-sm text-slate-300 transition hover:border-accent/40 hover:bg-elevated"
        >
          {s}
        </button>
      ))}
    </div>
  </div>
);

export const Transcript = ({
  items,
  onApprove,
  isRunning = false,
  onSuggest,
}: {
  items: readonly TranscriptItem[];
  onApprove: (approvalId: string, approved: boolean) => void;
  isRunning?: boolean;
  onSuggest?: (text: string) => void;
}): JSX.Element => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [items, isRunning]);

  if (items.length === 0) {
    return <EmptyState {...(onSuggest ? { onSuggest } : {})} />;
  }

  const last = items[items.length - 1];
  const streaming = last?.kind === 'assistant' && last.text.trim() !== '';

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      {items.map((item) => {
        switch (item.kind) {
          case 'user':
          case 'assistant':
            return <Message key={item.id} role={item.kind} text={item.text} />;
          case 'tool':
            return <ToolCallCard key={item.id} item={item} />;
          case 'approval':
            return (
              <ApprovalPrompt
                key={item.id}
                item={item}
                onDecide={(approved) => onApprove(item.approvalId, approved)}
              />
            );
          case 'error':
            return (
              <div
                key={item.id}
                className="animate-rise rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
              >
                {item.message}
              </div>
            );
          default:
            return null;
        }
      })}
      {isRunning && !streaming ? <ThinkingRow /> : null}
      <div ref={endRef} />
    </div>
  );
};
