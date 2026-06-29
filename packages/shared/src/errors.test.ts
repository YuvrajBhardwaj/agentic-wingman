import { describe, expect, it } from 'vitest';

import { isForgewrightError, toForgewrightError, ForgewrightError } from './errors.js';

describe('ForgewrightError', () => {
  it('carries code and context', () => {
    const e = new ForgewrightError('NOT_FOUND', 'missing', { id: 'x' });
    expect(e.code).toBe('NOT_FOUND');
    expect(e.context).toEqual({ id: 'x' });
    expect(isForgewrightError(e)).toBe(true);
    expect(e).toBeInstanceOf(Error);
  });

  it('toForgewrightError passes through existing ForgewrightErrors', () => {
    const original = new ForgewrightError('ABORTED', 'stop');
    expect(toForgewrightError(original)).toBe(original);
  });

  it('toForgewrightError wraps native errors with cause', () => {
    const native = new Error('boom');
    const wrapped = toForgewrightError(native, 'INTERNAL');
    expect(wrapped.code).toBe('INTERNAL');
    expect(wrapped.message).toBe('boom');
    expect(wrapped.cause).toBe(native);
  });

  it('toForgewrightError stringifies non-errors', () => {
    expect(toForgewrightError('weird').message).toBe('weird');
  });
});
