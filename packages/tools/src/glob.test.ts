import { describe, expect, it } from 'vitest';

import { matchGlob } from './glob.js';

describe('matchGlob', () => {
  it('matches single-segment wildcards', () => {
    expect(matchGlob('src/*.ts', 'src/a.ts')).toBe(true);
    expect(matchGlob('src/*.ts', 'src/nested/a.ts')).toBe(false);
  });

  it('matches deep wildcards', () => {
    expect(matchGlob('src/**/*.ts', 'src/a.ts')).toBe(true);
    expect(matchGlob('src/**/*.ts', 'src/a/b/c.ts')).toBe(true);
    expect(matchGlob('**/*.test.ts', 'packages/x/src/y.test.ts')).toBe(true);
  });

  it('supports brace alternation', () => {
    expect(matchGlob('**/*.{js,ts}', 'a/b.js')).toBe(true);
    expect(matchGlob('**/*.{js,ts}', 'a/b.ts')).toBe(true);
    expect(matchGlob('**/*.{js,ts}', 'a/b.md')).toBe(false);
  });

  it('matches the ? single char', () => {
    expect(matchGlob('file?.ts', 'file1.ts')).toBe(true);
    expect(matchGlob('file?.ts', 'file12.ts')).toBe(false);
  });
});
