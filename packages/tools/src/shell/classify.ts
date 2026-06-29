export type CommandClass = 'read-only' | 'mutating' | 'destructive';

/** Commands that only read state and are safe to auto-allow. */
const READ_ONLY = new Set([
  'ls',
  'cat',
  'pwd',
  'echo',
  'head',
  'tail',
  'grep',
  'find',
  'which',
  'whoami',
  'date',
  'env',
  'printenv',
  'wc',
  'sort',
  'uniq',
  'diff',
  'stat',
  'file',
  'tree',
  'node',
  'npm',
  'pnpm',
  'yarn',
  'git',
  'tsc',
  'eslint',
  'prettier',
  'vitest',
  'jest',
]);

/** Read-only subcommands for tools that are otherwise mutating (e.g. git). */
const READ_ONLY_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
  git: new Set([
    'status',
    'log',
    'diff',
    'show',
    'branch',
    'remote',
    'rev-parse',
    'ls-files',
    'blame',
  ]),
  npm: new Set(['test', 'run', 'list', 'ls', 'view', 'outdated', 'audit']),
  pnpm: new Set([
    'test',
    'run',
    'list',
    'ls',
    'why',
    'outdated',
    'audit',
    'lint',
    'typecheck',
    'build',
  ]),
};

/** Patterns that are always treated as destructive and require approval. */
const DESTRUCTIVE_PATTERNS: readonly RegExp[] = [
  /\brm\s+-[a-z]*[rf]/i, // rm -rf and friends
  /\brm\s+-[a-z]*f[a-z]*r/i,
  /\bdd\b/i,
  /\bmkfs\b/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\b:\(\)\s*\{.*\}\s*;/, // fork bomb
  /\bgit\s+push\b.*--force/i,
  /\bgit\s+push\s+-f\b/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgit\s+clean\s+-[a-z]*f/i,
  /[>|]\s*\/dev\/sd[a-z]/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bsudo\b/i,
  /\bcurl\b.*\|\s*(sh|bash)\b/i,
  /\bwget\b.*\|\s*(sh|bash)\b/i,
];

/** Shell tokens that compose commands; a chain is as dangerous as its worst part. */
const CHAIN_SPLIT = /\s*(?:&&|\|\||\||;|\n)\s*/;

const isDestructive = (command: string): boolean =>
  DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command));

const classifySingle = (command: string): CommandClass => {
  const trimmed = command.trim();
  if (trimmed === '') return 'read-only';

  if (isDestructive(trimmed)) return 'destructive';

  const tokens = trimmed.split(/\s+/);
  const program = tokens[0] ?? '';
  const subcommand = tokens[1];

  const readOnlySubs = READ_ONLY_SUBCOMMANDS[program];
  if (readOnlySubs && subcommand !== undefined) {
    return readOnlySubs.has(subcommand) ? 'read-only' : 'mutating';
  }

  if (READ_ONLY.has(program)) return 'read-only';
  return 'mutating';
};

/**
 * Classify a (possibly chained) shell command. The result is the most dangerous
 * classification among its parts.
 */
export const classifyCommand = (command: string): CommandClass => {
  // Some destructive forms span pipes (e.g. `curl ... | bash`); check the whole
  // command before splitting it into parts.
  if (isDestructive(command)) return 'destructive';

  const parts = command.split(CHAIN_SPLIT).filter((p) => p.trim() !== '');
  let worst: CommandClass = 'read-only';
  for (const part of parts) {
    const cls = classifySingle(part);
    if (cls === 'destructive') return 'destructive';
    if (cls === 'mutating') worst = 'mutating';
  }
  return worst;
};
