import type { PermissionRequest } from '@forgewright/types';
import { describe, expect, it, vi } from 'vitest';

import { DefaultPermissionBroker } from './permission-broker.js';

const req = (overrides: Partial<PermissionRequest> = {}): PermissionRequest => ({
  capability: 'fs.read',
  summary: 'test',
  ...overrides,
});

describe('DefaultPermissionBroker', () => {
  it('auto-allows reads by default', async () => {
    const broker = new DefaultPermissionBroker();
    expect(broker.evaluate(req({ capability: 'fs.read' }))).toBe('allow');
    expect((await broker.request(req({ capability: 'fs.read' }))).allowed).toBe(true);
  });

  it('prompts for writes and asks the approver', async () => {
    const approver = vi.fn(async () => true);
    const broker = new DefaultPermissionBroker({ approver });
    const grant = await broker.request(req({ capability: 'fs.write' }));
    expect(approver).toHaveBeenCalledOnce();
    expect(grant.allowed).toBe(true);
  });

  it('fails safe when no approver is configured', async () => {
    const broker = new DefaultPermissionBroker();
    const grant = await broker.request(req({ capability: 'shell.exec' }));
    expect(grant.allowed).toBe(false);
  });

  it('honors explicit allow rules with target patterns', async () => {
    const broker = new DefaultPermissionBroker({
      rules: [{ capability: 'fs.write', targetPattern: 'src/*', decision: 'allow' }],
    });
    expect(broker.evaluate(req({ capability: 'fs.write', target: 'src/a.ts' }))).toBe('allow');
    expect(broker.evaluate(req({ capability: 'fs.write', target: 'secret.env' }))).toBe('prompt');
  });

  it('never auto-allows destructive actions even with a broad allow rule', () => {
    const broker = new DefaultPermissionBroker({
      rules: [{ capability: 'shell.exec', decision: 'allow' }],
    });
    expect(broker.evaluate(req({ capability: 'shell.exec', destructive: true }))).toBe('prompt');
    expect(broker.evaluate(req({ capability: 'shell.exec', destructive: false }))).toBe('allow');
  });

  it('supports deny rules', async () => {
    const broker = new DefaultPermissionBroker({
      rules: [{ capability: 'net.http', decision: 'deny' }],
      approver: async () => true,
    });
    const grant = await broker.request(req({ capability: 'net.http', target: 'http://x' }));
    expect(grant.allowed).toBe(false);
  });

  it('addRule takes effect immediately', () => {
    const broker = new DefaultPermissionBroker();
    expect(broker.evaluate(req({ capability: 'fs.write' }))).toBe('prompt');
    broker.addRule({ capability: 'fs.write', decision: 'allow' });
    expect(broker.evaluate(req({ capability: 'fs.write' }))).toBe('allow');
  });
});
