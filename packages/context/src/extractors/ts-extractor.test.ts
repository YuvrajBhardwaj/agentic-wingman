import { describe, expect, it } from 'vitest';

import { TsSymbolExtractor } from './ts-extractor.js';

const extractor = new TsSymbolExtractor();

const SAMPLE = `import { readFile } from 'node:fs/promises';
import type { Logger } from '@forgewright/types';
import './side-effect.js';

export interface User {
  id: string;
  name: string;
}

export type Id = string;

export class Service {
  run(): void {}
}

export const helper = (x: number): number => x * 2;

export function compute(a: number) {
  return a + 1;
}

const PRIVATE = 42;

export enum Color {
  Red,
  Blue,
}
`;

describe('TsSymbolExtractor', () => {
  it('supports TS/JS files only', () => {
    expect(extractor.supports('a.ts')).toBe(true);
    expect(extractor.supports('a.tsx')).toBe(true);
    expect(extractor.supports('a.js')).toBe(true);
    expect(extractor.supports('a.py')).toBe(false);
    expect(extractor.supports('a.md')).toBe(false);
  });

  it('extracts symbols of each kind with exported flags', async () => {
    const { symbols } = await extractor.extract('src/sample.ts', SAMPLE);
    const byName = new Map(symbols.map((s) => [s.name, s]));

    expect(byName.get('User')?.kind).toBe('interface');
    expect(byName.get('User')?.exported).toBe(true);
    expect(byName.get('Id')?.kind).toBe('type');
    expect(byName.get('Service')?.kind).toBe('class');
    expect(byName.get('helper')?.kind).toBe('function');
    expect(byName.get('compute')?.kind).toBe('function');
    expect(byName.get('Color')?.kind).toBe('enum');
    expect(byName.get('PRIVATE')?.kind).toBe('constant');
    expect(byName.get('PRIVATE')?.exported).toBe(false);
  });

  it('captures multi-line block ranges', async () => {
    const { symbols } = await extractor.extract('src/sample.ts', SAMPLE);
    const user = symbols.find((s) => s.name === 'User');
    expect(user?.range.endLine).toBeGreaterThan(user?.range.startLine ?? 0);
  });

  it('parses imports including specifiers and externality', async () => {
    const { imports } = await extractor.extract('src/sample.ts', SAMPLE);
    const fsImport = imports.find((i) => i.toModule === 'node:fs/promises');
    expect(fsImport?.external).toBe(true);
    expect(fsImport?.symbols).toContain('readFile');

    const typeImport = imports.find((i) => i.toModule === '@forgewright/types');
    expect(typeImport?.symbols).toContain('Logger');

    const sideEffect = imports.find((i) => i.toModule === './side-effect.js');
    expect(sideEffect?.external).toBe(false);
    expect(sideEffect?.symbols).toEqual([]);
  });
});
