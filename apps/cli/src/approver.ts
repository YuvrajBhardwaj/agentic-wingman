import type { Approver } from '@forgewright/tools';
import type { PermissionPolicyRule, PermissionRequest } from '@forgewright/types';

import { color, glyph } from './theme.js';

export interface ApproverOptions {
  /** Ask the user a question and resolve with their raw answer. */
  readonly ask: (question: string) => Promise<string>;
  /** Persist an "always allow" decision for the rest of the session. */
  readonly addRule: (rule: PermissionPolicyRule) => void;
  /** Write a line to the transcript. */
  readonly out: (line: string) => void;
}

const CAPABILITY_VERB: Record<string, string> = {
  'fs.write': 'write a file',
  'fs.delete': 'delete a file',
  'shell.exec': 'run a shell command',
  'net.http': 'make a network request',
  'git.write': 'modify git state',
  'process.spawn': 'spawn a process',
  'integration.send': 'send a message',
  'mcp.call': 'call an MCP tool',
};

/**
 * Build a terminal approver. Prompts are serialized through a single promise
 * chain so parallel tool calls never race for stdin. Destructive actions never
 * offer "always allow".
 */
export const createTerminalApprover = (options: ApproverOptions): Approver => {
  let queue: Promise<unknown> = Promise.resolve();

  const prompt = async (request: PermissionRequest): Promise<boolean> => {
    const verb = CAPABILITY_VERB[request.capability] ?? request.capability;
    const target = request.target ? color.cyan(request.target) : '';
    const tag = request.destructive ? color.red(' (destructive)') : '';
    options.out(
      `${color.yellow(glyph.arrow)} Allow Forgewright to ${color.bold(verb)}${tag}? ${target}`.trim(),
    );
    options.out(color.dim(`  ${request.summary}`));

    const choices = request.destructive ? '[y]es / [N]o' : '[y]es / [a]lways / [N]o';
    const answer = (await options.ask(`  ${choices} `)).trim().toLowerCase();

    if (answer === 'a' && !request.destructive) {
      options.addRule({ capability: request.capability, decision: 'allow' });
      options.out(
        color.green(`  ${glyph.check} always allowing ${request.capability} this session`),
      );
      return true;
    }
    const approved = answer === 'y' || answer === 'yes';
    options.out(
      approved ? color.green(`  ${glyph.check} approved`) : color.gray(`  ${glyph.cross} declined`),
    );
    return approved;
  };

  return (request) => {
    const next = queue.then(() => prompt(request));
    // Keep the chain alive even if a prompt rejects, so later prompts still run.
    queue = next.catch(() => undefined);
    return next;
  };
};
