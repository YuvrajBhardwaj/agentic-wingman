import { MemorySink, StructuredLogger } from '@forgewright/shared';
import { describe, expect, it, vi } from 'vitest';

import { JobScheduler, type JobRun } from './scheduler.js';

const logger = new StructuredLogger({ sink: new MemorySink() });

describe('JobScheduler', () => {
  it('runs jobs when due and reschedules by interval', async () => {
    let clock = 1000;
    const scheduler = new JobScheduler({ logger, now: () => clock });
    const run = vi.fn(async () => ({ changed: false, summary: 'checked' }));
    scheduler.register({ id: 'watch', name: 'Watch repo', intervalMs: 100, run });

    await scheduler.runDue(clock); // due immediately
    expect(run).toHaveBeenCalledTimes(1);

    await scheduler.runDue(clock + 50); // not yet due again
    expect(run).toHaveBeenCalledTimes(1);

    clock += 100;
    await scheduler.runDue(clock); // due again
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('notifies only on meaningful change', async () => {
    const changes: JobRun[] = [];
    const scheduler = new JobScheduler({
      logger,
      now: () => 0,
      onChange: (r) => changes.push(r),
    });
    let calls = 0;
    scheduler.register({
      id: 'feed',
      name: 'RSS',
      intervalMs: 10,
      run: async () => {
        calls += 1;
        return calls === 2
          ? { changed: true, summary: 'new post' }
          : { changed: false, summary: 'no change' };
      },
    });

    await scheduler.runDue(0);
    await scheduler.runDue(10);
    await scheduler.runDue(20);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.result.summary).toBe('new post');
  });

  it('keeps running other jobs when one throws', async () => {
    const scheduler = new JobScheduler({ logger, now: () => 0 });
    scheduler.register({
      id: 'bad',
      name: 'bad',
      intervalMs: 10,
      run: async () => {
        throw new Error('boom');
      },
    });
    const ok = vi.fn(async () => ({ changed: false, summary: 'ok' }));
    scheduler.register({ id: 'good', name: 'good', intervalMs: 10, run: ok });

    const runs = await scheduler.runDue(0);
    expect(ok).toHaveBeenCalled();
    expect(runs.map((r) => r.jobId)).toEqual(['good']); // failed job produced no run
  });
});
