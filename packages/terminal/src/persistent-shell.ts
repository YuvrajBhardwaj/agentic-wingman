import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import { ForgewrightError } from '@forgewright/shared';

export interface ShellResult {
  readonly output: string;
  readonly exitCode: number;
}

export interface PersistentShellOptions {
  readonly cwd?: string;
  /** Shell binary; defaults to bash (preserves cwd/env across commands). */
  readonly shell?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Receives output chunks as they stream in. */
  readonly onData?: (chunk: string) => void;
}

interface Pending {
  readonly sentinel: RegExp;
  output: string;
  lineBuffer: string;
  resolve(result: ShellResult): void;
  reject(error: Error): void;
}

/**
 * A long-lived shell that preserves working directory and environment across
 * commands. Each `run` writes the command followed by a unique sentinel that
 * prints the exit code on its own line, so completion and status are detected
 * reliably while output streams via `onData`.
 */
export class PersistentShell {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly onData: ((chunk: string) => void) | undefined;
  private pending: Pending | undefined;
  private counter = 0;
  private dead = false;

  constructor(options: PersistentShellOptions = {}) {
    this.onData = options.onData;
    this.child = spawn(options.shell ?? 'bash', [], {
      ...(options.cwd ? { cwd: options.cwd } : {}),
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.child.stderr.on('data', (chunk: string) => this.onStderr(chunk));
    this.child.on('close', () => {
      this.dead = true;
      this.pending?.reject(new ForgewrightError('ABORTED', 'Shell terminated'));
      this.pending = undefined;
    });
    this.child.on('error', (error) => {
      this.dead = true;
      this.pending?.reject(
        new ForgewrightError('TOOL_EXECUTION_FAILED', `Shell error: ${error.message}`),
      );
    });
  }

  /** Run a command and resolve with its output and exit code. One at a time. */
  run(command: string): Promise<ShellResult> {
    if (this.dead) {
      return Promise.reject(new ForgewrightError('ABORTED', 'Shell is no longer running'));
    }
    if (this.pending) {
      return Promise.reject(new ForgewrightError('INTERNAL', 'A command is already running'));
    }
    const id = (this.counter += 1);
    const marker = `__FW_END_${id}__`;
    return new Promise<ShellResult>((resolve, reject) => {
      this.pending = {
        sentinel: new RegExp(`^${marker} (\\d+)$`),
        output: '',
        lineBuffer: '',
        resolve,
        reject,
      };
      // Leading newline guarantees the sentinel starts on its own line even if
      // the command's last output line had no trailing newline.
      this.child.stdin.write(`${command}\nprintf '\\n%s %d\\n' '${marker}' "$?"\n`);
    });
  }

  private onStdout(chunk: string): void {
    const pending = this.pending;
    if (!pending) return;
    pending.lineBuffer += chunk;
    let nl: number;
    while ((nl = pending.lineBuffer.indexOf('\n')) !== -1) {
      const line = pending.lineBuffer.slice(0, nl);
      pending.lineBuffer = pending.lineBuffer.slice(nl + 1);
      const match = pending.sentinel.exec(line);
      if (match) {
        const exitCode = Number(match[1]);
        const result: ShellResult = { output: pending.output.replace(/\n$/, ''), exitCode };
        this.pending = undefined;
        pending.resolve(result);
        return;
      }
      pending.output += `${line}\n`;
      this.onData?.(`${line}\n`);
    }
  }

  private onStderr(chunk: string): void {
    if (!this.pending) return;
    this.pending.output += chunk;
    this.onData?.(chunk);
  }

  /** Interrupt the running command (terminates the shell session). */
  interrupt(): void {
    if (this.dead) return;
    this.pending?.reject(new ForgewrightError('ABORTED', 'Command interrupted'));
    this.pending = undefined;
    this.child.kill('SIGKILL');
    this.dead = true;
  }

  async dispose(): Promise<void> {
    if (this.dead) return;
    this.dead = true;
    this.child.kill();
  }

  get isAlive(): boolean {
    return !this.dead;
  }
}
