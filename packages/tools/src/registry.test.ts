import { StructuredLogger, MemorySink } from '@forgewright/shared';
import type { ToolContext } from '@forgewright/types';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineTool } from './define-tool.js';
import { SandboxedFs } from './fs.js';
import { DefaultPermissionBroker } from './permission-broker.js';
import { DefaultToolRegistry } from './registry.js';

const makeCtx = (overrides: Partial<ToolContext> = {}): ToolContext => ({
  cwd: process.cwd(),
  signal: new AbortController().signal,
  permissions: new DefaultPermissionBroker({ approver: async () => true }),
  logger: new StructuredLogger({ sink: new MemorySink() }),
  fs: new SandboxedFs(process.cwd()),
  ...overrides,
});

const echoTool = defineTool<{ value: number }, { doubled: number }>({
  name: 'echo',
  description: 'doubles a number',
  capability: 'fs.read',
  input: z.object({ value: z.number() }),
  run: async (i) => ({ doubled: i.value * 2 }),
});

describe('DefaultToolRegistry', () => {
  it('registers and lists tools and produces specs', () => {
    const registry = new DefaultToolRegistry();
    registry.register(echoTool);
    expect(registry.get('echo')).toBe(echoTool);
    const specs = registry.specs();
    expect(specs[0]?.name).toBe('echo');
    expect(specs[0]?.parameters.type).toBe('object');
  });

  it('rejects duplicate registration', () => {
    const registry = new DefaultToolRegistry();
    registry.register(echoTool);
    expect(() => registry.register(echoTool)).toThrowError(/already registered/);
  });

  it('validates input before executing', async () => {
    const registry = new DefaultToolRegistry();
    registry.register(echoTool);
    await expect(registry.execute('echo', { value: 'nope' }, makeCtx())).rejects.toThrowError(
      /invalid|expected number/i,
    );
  });

  it('runs the validate -> permit -> execute pipeline', async () => {
    const registry = new DefaultToolRegistry();
    registry.register(echoTool);
    const result = await registry.execute('echo', { value: 21 }, makeCtx());
    expect(result).toEqual({ doubled: 42 });
  });

  it('blocks execution when permission is denied', async () => {
    const registry = new DefaultToolRegistry();
    const writeTool = defineTool<{ x: number }, number>({
      name: 'danger',
      description: 'writes',
      capability: 'fs.write',
      input: z.object({ x: z.number() }),
      run: async (i) => i.x,
    });
    registry.register(writeTool);
    const ctx = makeCtx({
      permissions: new DefaultPermissionBroker({ approver: async () => false }),
    });
    await expect(registry.execute('danger', { x: 1 }, ctx)).rejects.toThrowError(/denied/);
  });

  it('throws for unknown tools', async () => {
    const registry = new DefaultToolRegistry();
    await expect(registry.execute('ghost', {}, makeCtx())).rejects.toThrowError(/Unknown tool/);
  });

  it('does not run a tool whose signal is already aborted', async () => {
    const registry = new DefaultToolRegistry();
    const run = vi.fn(async () => ({ doubled: 0 }));
    registry.register(
      defineTool({
        name: 'aborter',
        description: 'x',
        capability: 'fs.read',
        input: z.object({ value: z.number() }),
        run,
      }),
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      registry.execute('aborter', { value: 1 }, makeCtx({ signal: controller.signal })),
    ).rejects.toThrowError(/aborted/);
    expect(run).not.toHaveBeenCalled();
  });
});
