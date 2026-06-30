import type { AgentEvent } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { summarizeInput, TranscriptRenderer } from './render.js';

// Force color off so assertions match raw text (no ANSI escapes).
process.env.FORGE_NO_COLOR = '1';

const drive = (
  events: readonly AgentEvent[],
): { buffer: string; result: ReturnType<TranscriptRenderer['finish']> } => {
  let buffer = '';
  const renderer = new TranscriptRenderer((f) => {
    buffer += f;
  });
  for (const event of events) renderer.handle(event);
  // finish() must run before `buffer` is read — it may emit a trailing line.
  const result = renderer.finish();
  return { buffer, result };
};

describe('summarizeInput', () => {
  it('picks the most relevant argument', () => {
    expect(summarizeInput({ path: 'src/a.ts' })).toBe('src/a.ts');
    expect(summarizeInput({ command: 'pnpm test' })).toBe('pnpm test');
    expect(summarizeInput({ pattern: '**/*.ts' })).toBe('**/*.ts');
    expect(summarizeInput({})).toBe('');
    expect(summarizeInput(null)).toBe('');
  });

  it('truncates very long values', () => {
    const long = 'x'.repeat(200);
    expect(summarizeInput({ path: long }).length).toBeLessThanOrEqual(80);
  });
});

describe('TranscriptRenderer', () => {
  it('streams assistant text verbatim', () => {
    const { buffer, result } = drive([
      { type: 'message', delta: 'Hello, ' },
      { type: 'message', delta: 'world' },
      { type: 'done', reason: 'completed' },
    ]);
    expect(buffer).toContain('Hello, world');
    expect(result.text).toBe('Hello, world');
    expect(result.reason).toBe('completed');
  });

  it('renders a tool call card and its result', () => {
    const { buffer } = drive([
      { type: 'tool_call', id: '1', name: 'read_file', input: { path: 'src/x.ts' } },
      { type: 'tool_result', id: '1', output: { content: 'abc' }, isError: false },
      { type: 'done', reason: 'completed' },
    ]);
    expect(buffer).toContain('Read');
    expect(buffer).toContain('src/x.ts');
    expect(buffer).toContain('3 chars');
  });

  it('marks tool errors', () => {
    const { buffer } = drive([
      { type: 'tool_call', id: '1', name: 'run_command', input: { command: 'false' } },
      { type: 'tool_result', id: '1', output: { error: 'exit 1' }, isError: true },
      { type: 'done', reason: 'completed' },
    ]);
    expect(buffer).toContain('exit 1');
  });

  it('de-duplicates the twin usage events the loop emits', () => {
    const usage = { promptTokens: 100, completionTokens: 5, totalTokens: 105 };
    const { result } = drive([
      { type: 'usage', usage },
      { type: 'usage', usage },
      { type: 'done', reason: 'completed' },
    ]);
    expect(result.usage.totalTokens).toBe(105);
  });

  it('notes an empty completed turn instead of printing nothing', () => {
    const { buffer } = drive([{ type: 'done', reason: 'completed' }]);
    expect(buffer.toLowerCase()).toContain('no response');
  });

  it('does not add the empty-turn note when text was produced', () => {
    const { buffer } = drive([
      { type: 'message', delta: 'hi' },
      { type: 'done', reason: 'completed' },
    ]);
    expect(buffer.toLowerCase()).not.toContain('no response');
  });

  it('surfaces a non-completed reason with its message', () => {
    const { buffer, result } = drive([
      { type: 'done', reason: 'max_steps', message: 'Stopped after 12 steps' },
    ]);
    expect(buffer).toContain('max_steps');
    expect(buffer).toContain('Stopped after 12 steps');
    expect(result.reason).toBe('max_steps');
  });
});
