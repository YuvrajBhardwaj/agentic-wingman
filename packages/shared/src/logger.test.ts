import { describe, expect, it } from 'vitest';

import { FakeClock } from './clock.js';
import { MemorySink, StructuredLogger } from './logger.js';

describe('StructuredLogger', () => {
  it('respects the configured level', () => {
    const sink = new MemorySink();
    const log = new StructuredLogger({ level: 'warn', sink, clock: new FakeClock(1000) });
    log.debug('nope');
    log.info('nope');
    log.warn('yes');
    log.error('yes');
    expect(sink.records.map((r) => r.level)).toEqual(['warn', 'error']);
  });

  it('stamps records with the injected clock', () => {
    const sink = new MemorySink();
    const log = new StructuredLogger({ level: 'info', sink, clock: new FakeClock(5000) });
    log.info('hello');
    expect(sink.records[0]?.time).toBe(5000);
  });

  it('merges child bindings into every record', () => {
    const sink = new MemorySink();
    const log = new StructuredLogger({ level: 'info', sink, clock: new FakeClock() }).child({
      component: 'agent',
    });
    log.info('run', { step: 1 });
    expect(sink.records[0]?.fields).toEqual({ component: 'agent', step: 1 });
  });
});
