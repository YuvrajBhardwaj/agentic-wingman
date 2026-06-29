import type { Logger } from '@forgewright/types';

export interface JobContext {
  readonly logger: Logger;
  readonly signal?: AbortSignal;
}

export interface JobResult {
  /** Whether something meaningful changed — only then is the user notified. */
  readonly changed: boolean;
  readonly summary: string;
  readonly data?: unknown;
}

export interface Job {
  readonly id: string;
  readonly name: string;
  readonly intervalMs: number;
  run(ctx: JobContext): Promise<JobResult>;
}

export interface JobRun {
  readonly jobId: string;
  readonly at: number;
  readonly result: JobResult;
}

export type ChangeNotifier = (run: JobRun) => void;

export interface JobSchedulerOptions {
  readonly logger: Logger;
  readonly now: () => number;
  /** Called only when a job reports `changed: true`. */
  readonly onChange?: ChangeNotifier;
  /** Run each job on its first due tick immediately (default true). */
  readonly runImmediately?: boolean;
  /** Poll interval for the real timer loop (default 1000ms). */
  readonly pollMs?: number;
}

interface Scheduled {
  readonly job: Job;
  lastRun: number | undefined;
  nextRun: number;
}

/**
 * Runs registered jobs on their intervals. Notifies the host only when a job
 * reports a meaningful change. Drive it with a real timer via `start()`, or call
 * `runDue(now)` directly (deterministic; used in tests).
 */
export class JobScheduler {
  private readonly jobs = new Map<string, Scheduled>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly options: JobSchedulerOptions) {}

  register(job: Job): void {
    const now = this.options.now();
    this.jobs.set(job.id, {
      job,
      lastRun: undefined,
      nextRun: (this.options.runImmediately ?? true) ? now : now + job.intervalMs,
    });
  }

  unregister(jobId: string): void {
    this.jobs.delete(jobId);
  }

  list(): readonly { id: string; name: string; nextRun: number; lastRun: number | undefined }[] {
    return [...this.jobs.values()].map((s) => ({
      id: s.job.id,
      name: s.job.name,
      nextRun: s.nextRun,
      lastRun: s.lastRun,
    }));
  }

  /** Run every job whose nextRun is due at `now`; returns the runs performed. */
  async runDue(now: number, signal?: AbortSignal): Promise<readonly JobRun[]> {
    const runs: JobRun[] = [];
    for (const scheduled of this.jobs.values()) {
      if (scheduled.nextRun > now) continue;
      const ctx: JobContext = { logger: this.options.logger, ...(signal ? { signal } : {}) };
      try {
        const result = await scheduled.job.run(ctx);
        scheduled.lastRun = now;
        scheduled.nextRun = now + scheduled.job.intervalMs;
        const run: JobRun = { jobId: scheduled.job.id, at: now, result };
        runs.push(run);
        if (result.changed) this.options.onChange?.(run);
      } catch (error) {
        scheduled.lastRun = now;
        scheduled.nextRun = now + scheduled.job.intervalMs;
        this.options.logger.warn('job_failed', {
          jobId: scheduled.job.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return runs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runDue(this.options.now());
    }, this.options.pollMs ?? 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
