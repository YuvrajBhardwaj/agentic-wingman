import { spawn } from 'node:child_process';

import { z } from 'zod';

import { defineTool } from '../define-tool.js';
import { classifyCommand } from '../shell/classify.js';

const input = z.object({
  command: z.string().min(1).describe('Shell command to execute in the workspace'),
  timeoutMs: z.number().int().min(100).max(600000).default(120000),
});

export interface ShellResult {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly classification: ReturnType<typeof classifyCommand>;
}

const MAX_OUTPUT = 100_000; // cap captured output to keep context bounded

/**
 * Execute a shell command in the workspace. The command is classified; mutating
 * and destructive commands require approval via the permission broker (gated by
 * the registry before this runs). Output is streamed to the logger and captured.
 */
export const shellTool = defineTool({
  name: 'execute_shell',
  description:
    'Run a shell command in the workspace. Mutating/destructive commands require approval.',
  capability: 'shell.exec',
  input,
  describe: (i) => {
    const classification = classifyCommand(i.command);
    return {
      summary: `Run: ${i.command}`,
      target: i.command,
      destructive: classification === 'destructive' || classification === 'mutating',
    };
  },
  run: (i, ctx) =>
    new Promise<ShellResult>((resolve, reject) => {
      const classification = classifyCommand(i.command);
      const child = spawn(i.command, {
        cwd: ctx.cwd,
        shell: true,
        signal: ctx.signal,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, i.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (stdout.length < MAX_OUTPUT) stdout += text;
        ctx.logger.debug('shell_stdout', { text });
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (stderr.length < MAX_OUTPUT) stderr += text;
        ctx.logger.debug('shell_stderr', { text });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        if (ctx.signal.aborted) {
          reject(new Error('Command aborted'));
          return;
        }
        reject(error);
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          command: i.command,
          exitCode: code,
          stdout: stdout.slice(0, MAX_OUTPUT),
          stderr: stderr.slice(0, MAX_OUTPUT),
          timedOut,
          classification,
        });
      });
    }),
});
