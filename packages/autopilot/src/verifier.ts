import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VerifyResult {
  readonly passed: boolean;
  readonly output: string;
}

/** Runs the project's verification (tests/lint/build) and reports pass/fail. */
export type Verifier = (signal?: AbortSignal) => Promise<VerifyResult>;

const MAX_OUTPUT = 8000;

interface ExecError {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly message?: string;
}

/** A verifier that runs a shell command; non-zero exit means failure. */
export const commandVerifier = (command: string, cwd: string): Verifier => {
  return async (signal) => {
    try {
      const { stdout, stderr } = await execFileAsync(command, {
        cwd,
        shell: true,
        maxBuffer: 32 * 1024 * 1024,
        ...(signal ? { signal } : {}),
      });
      return { passed: true, output: `${stdout}${stderr}`.slice(-MAX_OUTPUT) };
    } catch (error) {
      const e = error as ExecError;
      const output = `${e.stdout ?? ''}${e.stderr ?? ''}` || e.message || 'command failed';
      return { passed: false, output: output.slice(-MAX_OUTPUT) };
    }
  };
};
