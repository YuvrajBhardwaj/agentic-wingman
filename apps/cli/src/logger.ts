import { StructuredLogger, type LogRecord, type LogSink } from '@forgewright/shared';
import type { Logger } from '@forgewright/types';

import { color } from './theme.js';

/**
 * A sink that keeps the terminal quiet: info/debug are dropped, warn/error are
 * written compactly to stderr so they don't corrupt the streamed transcript on
 * stdout. Set FORGE_CLI_DEBUG=1 to see everything.
 */
class CliSink implements LogSink {
  constructor(private readonly verbose: boolean) {}

  write(record: LogRecord): void {
    if (!this.verbose && record.level !== 'warn' && record.level !== 'error') return;
    const tint = record.level === 'error' ? color.red : color.yellow;
    const fields = Object.keys(record.fields).length
      ? color.gray(` ${JSON.stringify(record.fields)}`)
      : '';
    process.stderr.write(`${tint(`${record.level}:`)} ${record.message}${fields}\n`);
  }
}

export const createCliLogger = (): Logger => {
  const verbose = process.env.FORGE_CLI_DEBUG === '1';
  return new StructuredLogger({
    level: verbose ? 'debug' : 'warn',
    sink: new CliSink(verbose),
  });
};
