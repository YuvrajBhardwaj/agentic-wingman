import { useState } from 'react';

import type { TranscriptItem } from '../state/transcript.ts';

import { CodeBlock } from './CodeBlock.tsx';

type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>;

const STATUS_STYLE: Record<ToolItem['status'], string> = {
  running: 'text-warning',
  done: 'text-success',
  error: 'text-danger',
};

const STATUS_DOT: Record<ToolItem['status'], string> = {
  running: 'bg-warning animate-pulse',
  done: 'bg-success',
  error: 'bg-danger',
};

const writeFileContent = (item: ToolItem): { path: string; content: string } | undefined => {
  if (item.name !== 'write_file') return undefined;
  const input = item.input as { path?: unknown; content?: unknown } | null;
  if (input && typeof input.path === 'string' && typeof input.content === 'string') {
    return { path: input.path, content: input.content };
  }
  return undefined;
};

export const ToolCallCard = ({ item }: { item: ToolItem }): JSX.Element => {
  const [open, setOpen] = useState(item.name === 'write_file');
  const fileWrite = writeFileContent(item);

  return (
    <div className="rounded-lg border border-border bg-surface/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[item.status]}`} aria-hidden />
        <span className="font-mono text-accent">{item.name}</span>
        <span className="truncate text-muted">{fileWrite?.path ?? summarizeInput(item.input)}</span>
        <span className={`ml-auto text-xs ${STATUS_STYLE[item.status]}`}>{item.status}</span>
      </button>

      {open ? (
        <div className="space-y-2 px-3 pb-3">
          {fileWrite ? (
            <CodeBlock code={fileWrite.content} label={`✎ ${fileWrite.path}`} />
          ) : (
            <CodeBlock code={pretty(item.input)} label="input" />
          )}
          {item.output !== undefined && !fileWrite ? (
            <CodeBlock code={pretty(item.output)} label="result" />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

const summarizeInput = (input: unknown): string => {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const key = ['path', 'pattern', 'command', 'url', 'query'].find(
      (k) => typeof obj[k] === 'string',
    );
    if (key) return String(obj[key]);
  }
  return '';
};

const pretty = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
