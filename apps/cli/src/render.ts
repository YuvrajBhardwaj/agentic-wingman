import type { AgentEvent, TokenUsage } from '@forgewright/types';

import { color, glyph } from './theme.js';

/** Pretty tool labels; unknown tools fall back to their raw name. */
const TOOL_LABEL: Record<string, string> = {
  read_file: 'Read',
  write_file: 'Write',
  list_dir: 'List',
  glob_search: 'Glob',
  grep_search: 'Search',
  execute_shell: 'Bash',
  http_request: 'Fetch',
};

const labelFor = (name: string): string => TOOL_LABEL[name] ?? name;

/** Pull the most meaningful argument out of a tool input for a one-line card. */
export const summarizeInput = (input: unknown): string => {
  if (input === null || typeof input !== 'object') return '';
  const o = input as Record<string, unknown>;
  const key = o.path ?? o.file ?? o.command ?? o.pattern ?? o.query ?? o.dir ?? o.url;
  if (typeof key === 'string') return key.length > 80 ? `${key.slice(0, 77)}…` : key;
  return '';
};

const summarizeOutput = (output: unknown): string => {
  if (output === null || output === undefined) return '';
  if (typeof output === 'string') return firstLine(output);
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    if (typeof o.error === 'string') return firstLine(o.error);
    if (typeof o.message === 'string') return firstLine(o.message);
    if (Array.isArray(o.matches)) return `${o.matches.length} match(es)`;
    if (Array.isArray(o.entries)) return `${o.entries.length} entr(ies)`;
    if (typeof o.bytesWritten === 'number') return `${o.bytesWritten} bytes written`;
    if (typeof o.content === 'string') return `${o.content.length} chars`;
  }
  return '';
};

const firstLine = (text: string): string => {
  const line = text.split('\n', 1)[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 77)}…` : line;
};

const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  promptTokens: a.promptTokens + b.promptTokens,
  completionTokens: a.completionTokens + b.completionTokens,
  totalTokens: a.totalTokens + b.totalTokens,
});

export interface RenderResult {
  readonly reason: string;
  readonly usage: TokenUsage;
  readonly text: string;
}

/**
 * Renders a stream of {@link AgentEvent}s to a terminal-like sink. `out` writes a
 * full line; `write` streams a raw fragment (no newline) for token-by-token text.
 */
export class TranscriptRenderer {
  private atLineStart = true;
  private text = '';
  private produced = false;
  private reason = 'completed';
  private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  // De-dupe the loop's twin usage events (it emits the same total twice).
  private lastUsageKey = '';

  constructor(private readonly write: (fragment: string) => void) {}

  /** Write a full line (fragment + newline). */
  private out(line: string): void {
    this.write(`${line}\n`);
  }

  /** Ensure subsequent structured output starts on its own line. */
  private breakLine(): void {
    if (!this.atLineStart) {
      this.write('\n');
      this.atLineStart = true;
    }
  }

  handle(event: AgentEvent): void {
    switch (event.type) {
      case 'message':
        if (event.delta) {
          this.write(event.delta);
          this.text += event.delta;
          this.produced = true;
          this.atLineStart = event.delta.endsWith('\n');
        }
        break;
      case 'tool_call': {
        this.produced = true;
        this.breakLine();
        const arg = summarizeInput(event.input);
        this.out(
          `${color.cyan(glyph.bullet)} ${color.bold(labelFor(event.name))}` +
            (arg ? `  ${color.dim(arg)}` : ''),
        );
        break;
      }
      case 'tool_result': {
        const summary = summarizeOutput(event.output);
        if (event.isError) {
          this.out(`  ${color.red(glyph.cross)} ${color.red(summary || 'failed')}`);
        } else if (summary) {
          this.out(`  ${color.green(glyph.check)} ${color.dim(summary)}`);
        }
        break;
      }
      case 'usage': {
        const key = `${event.usage.promptTokens}/${event.usage.completionTokens}`;
        if (key !== this.lastUsageKey) {
          this.usage = addUsage(this.usage, event.usage);
          this.lastUsageKey = key;
        }
        break;
      }
      case 'done':
        this.reason = event.reason;
        if (event.reason !== 'completed') {
          this.breakLine();
          const note = event.message ? `: ${event.message}` : '';
          this.out(color.yellow(`  ${glyph.dot} ${event.reason}${note}`));
        }
        break;
      default:
        break;
    }
  }

  finish(): RenderResult {
    this.breakLine();
    // The model occasionally returns an empty turn (no text, no tool call).
    // Surface it so the user isn't left staring at a blank response.
    if (this.reason === 'completed' && !this.produced) {
      this.out(color.dim('  (no response returned — try again)'));
    }
    return { reason: this.reason, usage: this.usage, text: this.text };
  }
}
