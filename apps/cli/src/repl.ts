import { createInterface, type Interface } from 'node:readline';

import { commandNames, handleCommand, parseCommand } from './commands.js';
import { TranscriptRenderer } from './render.js';
import type { CliSession } from './session.js';
import { color, glyph } from './theme.js';

/**
 * A line reader over readline that resolves the next submitted line regardless
 * of context, so the same input channel serves both the main prompt and inline
 * approval questions. SIGINT is surfaced to the caller via a handler.
 */
class LineReader {
  private readonly rl: Interface;
  private waiter: ((line: string) => void) | null = null;
  /** Lines received before a waiter was ready (e.g. piped/scripted input). */
  private readonly pending: string[] = [];
  /** Resolves when the underlying readline closes (Ctrl+D, .close(), or EOF). */
  readonly closed: Promise<void>;

  constructor(private readonly onSigint: () => void) {
    this.rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      completer: (line: string): [string[], string] => {
        if (!line.startsWith('/')) return [[], line];
        const hits = commandNames()
          .map((n) => `/${n}`)
          .filter((c) => c.startsWith(line));
        return [hits.length ? hits : [], line];
      },
    });
    this.rl.on('line', (line) => {
      const w = this.waiter;
      this.waiter = null;
      if (w) w(line);
      else this.pending.push(line); // buffer until the next question() consumes it
    });
    this.rl.on('SIGINT', () => this.onSigint());
    this.closed = new Promise((resolve) => this.rl.once('close', () => resolve()));
  }

  /** Show `prompt` and resolve with the next line the user submits. */
  question(prompt: string): Promise<string> {
    const queued = this.pending.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    this.rl.setPrompt(prompt);
    this.rl.prompt();
    return new Promise((resolve) => {
      this.waiter = resolve;
    });
  }

  /** Force the pending question (if any) to resolve — used to decline on cancel. */
  resolvePending(value: string): void {
    const w = this.waiter;
    this.waiter = null;
    w?.(value);
  }

  write(line: string): void {
    process.stdout.write(line);
  }

  close(): void {
    this.rl.close();
  }
}

export interface ReplOptions {
  readonly session: CliSession;
  /** Build the terminal approver once the LineReader exists (it needs `ask`). */
  readonly attachApprover: (ask: (q: string) => Promise<string>) => void;
}

const PROMPT = `${color.cyan(glyph.arrow)} `;

/** Run the interactive REPL until the user exits. */
export const runRepl = async (options: ReplOptions): Promise<void> => {
  const { session } = options;
  let activeRun: AbortController | null = null;
  let exitArmed = false;

  const reader = new LineReader(() => {
    if (activeRun) {
      // Cancel the in-flight run; decline any pending approval.
      activeRun.abort();
      reader.resolvePending('n');
      process.stdout.write(color.gray(' ^C cancelled\n'));
    } else if (exitArmed) {
      reader.close();
    } else {
      exitArmed = true;
      process.stdout.write(color.dim('\n(press Ctrl+C again to exit)\n'));
      void prompt();
    }
  });

  options.attachApprover((q) => reader.question(q));

  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  const runAgent = async (input: string): Promise<void> => {
    const controller = new AbortController();
    activeRun = controller;
    const renderer = new TranscriptRenderer((f) => reader.write(f));
    try {
      for await (const event of session.run(input, controller.signal)) {
        renderer.handle(event);
      }
    } catch (error) {
      out(color.red(`  error: ${error instanceof Error ? error.message : String(error)}`));
    } finally {
      activeRun = null;
    }
    const result = renderer.finish();
    session.record(input, result.text);
    if (result.usage.totalTokens > 0) {
      out(color.gray(`  ${glyph.dot} ${result.usage.totalTokens} tokens`));
    }
  };

  const prompt = async (): Promise<void> => {
    const line = await reader.question(PROMPT);
    exitArmed = false;
    const text = line.trim();
    if (!text) return prompt();

    const parsed = parseCommand(text);
    if (parsed) {
      const result = handleCommand(parsed, { session, args: parsed.args, out });
      switch (result.kind) {
        case 'exit':
          reader.close();
          return;
        case 'clear':
          session.clearHistory();
          process.stdout.write('\x1Bc');
          return prompt();
        case 'unknown':
          out(color.yellow(`Unknown command: /${result.name} — try /help`));
          return prompt();
        case 'run':
          await runAgent(result.input);
          return prompt();
        case 'handled':
        default:
          return prompt();
      }
    }

    await runAgent(text);
    return prompt();
  };

  printBanner(session);
  void prompt();
  await reader.closed;
  out(color.dim('Bye.'));
};

const printBanner = (session: CliSession): void => {
  const line = color.gray('─'.repeat(48));
  process.stdout.write(
    `${color.bold(color.magenta('forgewright'))} ${color.dim('· terminal agent')}  ` +
      `${color.dim('model:')} ${color.cyan(session.modelLabel())}\n`,
  );
  process.stdout.write(`${line}\n`);
  process.stdout.write(color.dim('Type a request, or /help for commands.\n'));
};
