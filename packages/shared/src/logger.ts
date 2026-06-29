import type { LogFields, Logger, LogLevel } from '@forgewright/types';

import type { Clock } from './clock.js';
import { SystemClock } from './clock.js';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogSink {
  write(record: LogRecord): void;
}

export interface LogRecord {
  readonly level: LogLevel;
  readonly time: number;
  readonly message: string;
  readonly fields: LogFields;
}

/** Default sink: structured JSON to the appropriate console stream. */
export class ConsoleSink implements LogSink {
  write(record: LogRecord): void {
    const line = JSON.stringify({
      level: record.level,
      time: new Date(record.time).toISOString(),
      msg: record.message,
      ...record.fields,
    });
    if (record.level === 'error' || record.level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly sink?: LogSink;
  readonly clock?: Clock;
  readonly bindings?: LogFields;
}

/** Leveled, structured logger with child-binding support. */
export class StructuredLogger implements Logger {
  private readonly level: LogLevel;
  private readonly sink: LogSink;
  private readonly clock: Clock;
  private readonly bindings: LogFields;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.sink = options.sink ?? new ConsoleSink();
    this.clock = options.clock ?? new SystemClock();
    this.bindings = options.bindings ?? {};
  }

  private log(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    this.sink.write({
      level,
      time: this.clock.now(),
      message,
      fields: { ...this.bindings, ...fields },
    });
  }

  debug(message: string, fields?: LogFields): void {
    this.log('debug', message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.log('info', message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.log('warn', message, fields);
  }

  error(message: string, fields?: LogFields): void {
    this.log('error', message, fields);
  }

  child(bindings: LogFields): Logger {
    return new StructuredLogger({
      level: this.level,
      sink: this.sink,
      clock: this.clock,
      bindings: { ...this.bindings, ...bindings },
    });
  }
}

/** Collects records in memory; useful for tests. */
export class MemorySink implements LogSink {
  readonly records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}
