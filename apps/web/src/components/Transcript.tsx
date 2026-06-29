import { useEffect, useRef } from 'react';

import type { TranscriptItem } from '../state/transcript.ts';

import { ApprovalPrompt } from './ApprovalPrompt.tsx';
import { Message } from './Message.tsx';
import { ToolCallCard } from './ToolCallCard.tsx';

export const Transcript = ({
  items,
  onApprove,
}: {
  items: readonly TranscriptItem[];
  onApprove: (approvalId: string, approved: boolean) => void;
}): JSX.Element => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // scrollIntoView is unavailable in jsdom; guard the optional method.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-center text-muted">
        <div>
          <p className="text-lg font-medium text-slate-300">Forgewright</p>
          <p className="mt-1 text-sm">Ask it to explain, search, or change your codebase.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
                className="rounded-lg border border-danger/50 bg-danger/10 p-3 text-sm text-danger"
              >
                {item.message}
              </div>
            );
          default:
            return null;
        }
      })}
      <div ref={endRef} />
    </div>
  );
};
