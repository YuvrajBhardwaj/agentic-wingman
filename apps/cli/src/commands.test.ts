import { describe, expect, it } from 'vitest';

import { commandNames, handleCommand, parseCommand, type CommandContext } from './commands.js';
import type { CliSession } from './session.js';

const fakeSession = (): CliSession =>
  ({
    config: { workspaceRoot: '/repo' },
    modelLabel: () => 'test-model (host)',
    toolSpecs: () => [{ name: 'read_file', description: 'Read a file', parameters: {} }],
  }) as unknown as CliSession;

const ctx = (args = ''): { ctx: CommandContext; lines: string[] } => {
  const lines: string[] = [];
  return {
    lines,
    ctx: { session: fakeSession(), args, out: (l) => lines.push(l) },
  };
};

describe('parseCommand', () => {
  it('returns null for non-commands', () => {
    expect(parseCommand('hello world')).toBeNull();
    expect(parseCommand('  not a / command')).toBeNull();
  });

  it('parses a bare command', () => {
    expect(parseCommand('/help')).toEqual({ name: 'help', args: '' });
    expect(parseCommand('  /CLEAR  ')).toEqual({ name: 'clear', args: '' });
  });

  it('splits name and trailing args', () => {
    expect(parseCommand('/model gpt-4o now')).toEqual({ name: 'model', args: 'gpt-4o now' });
  });
});

describe('handleCommand', () => {
  it('reports unknown commands', () => {
    const { ctx: c } = ctx();
    expect(handleCommand({ name: 'nope', args: '' }, c)).toEqual({ kind: 'unknown', name: 'nope' });
  });

  it('exits on /exit and /quit', () => {
    const { ctx: c } = ctx();
    expect(handleCommand({ name: 'exit', args: '' }, c).kind).toBe('exit');
    expect(handleCommand({ name: 'quit', args: '' }, c).kind).toBe('exit');
  });

  it('clears on /clear', () => {
    const { ctx: c } = ctx();
    expect(handleCommand({ name: 'clear', args: '' }, c).kind).toBe('clear');
  });

  it('/init returns a run with a repo-analysis prompt', () => {
    const { ctx: c } = ctx();
    const result = handleCommand({ name: 'init', args: '' }, c);
    expect(result.kind).toBe('run');
    if (result.kind === 'run') expect(result.input.toLowerCase()).toContain('agents.md');
  });

  it('/model prints the active model', () => {
    const { ctx: c, lines } = ctx();
    expect(handleCommand({ name: 'model', args: '' }, c).kind).toBe('handled');
    expect(lines.join('\n')).toContain('test-model');
  });

  it('/tools lists registered tools', () => {
    const { ctx: c, lines } = ctx();
    handleCommand({ name: 'tools', args: '' }, c);
    expect(lines.join('\n')).toContain('read_file');
  });

  it('/help lists every command name', () => {
    const { ctx: c, lines } = ctx();
    handleCommand({ name: 'help', args: '' }, c);
    const text = lines.join('\n');
    for (const name of commandNames()) expect(text).toContain(`/${name}`);
  });

  it('does not throw for any known command', () => {
    for (const name of commandNames()) {
      const { ctx: c } = ctx();
      expect(() => handleCommand({ name, args: '' }, c)).not.toThrow();
    }
  });
});
