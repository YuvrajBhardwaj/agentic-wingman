import type { CliSession } from './session.js';
import { color, glyph } from './theme.js';

export interface ParsedCommand {
  readonly name: string;
  readonly args: string;
}

/** Parse a `/command rest of line` into its name and trailing args, or null. */
export const parseCommand = (line: string): ParsedCommand | null => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/')) return null;
  const space = trimmed.indexOf(' ');
  if (space === -1) return { name: trimmed.slice(1).toLowerCase(), args: '' };
  return {
    name: trimmed.slice(1, space).toLowerCase(),
    args: trimmed.slice(space + 1).trim(),
  };
};

export type CommandResult =
  | { readonly kind: 'handled' }
  | { readonly kind: 'run'; readonly input: string }
  | { readonly kind: 'clear' }
  | { readonly kind: 'exit' }
  | { readonly kind: 'unknown'; readonly name: string };

interface CommandSpec {
  readonly name: string;
  readonly summary: string;
  readonly run: (ctx: CommandContext) => CommandResult;
}

export interface CommandContext {
  readonly session: CliSession;
  readonly args: string;
  readonly out: (line: string) => void;
}

const INIT_PROMPT =
  'Analyze this repository — its structure, tech stack, and build/test commands — ' +
  'and write a concise AGENTS.md at the workspace root that an AI coding agent could ' +
  'use to get productive quickly. Cover: what the project is, the layout, how to ' +
  'build/test/lint, and key conventions. Keep it under ~60 lines.';

const COMMANDS: readonly CommandSpec[] = [
  {
    name: 'help',
    summary: 'Show available commands',
    run: ({ out }) => {
      out(color.bold('Commands:'));
      for (const c of COMMANDS) {
        out(`  ${color.cyan(`/${c.name}`.padEnd(10))} ${color.dim(c.summary)}`);
      }
      out(color.dim('  Anything else is sent to the agent. Ctrl+C cancels a run, twice exits.'));
      return { kind: 'handled' };
    },
  },
  {
    name: 'model',
    summary: 'Show the active model',
    run: ({ session, out }) => {
      out(`${glyph.bullet} model: ${color.cyan(session.modelLabel())}`);
      return { kind: 'handled' };
    },
  },
  {
    name: 'tools',
    summary: 'List the tools the agent can use',
    run: ({ session, out }) => {
      for (const spec of session.toolSpecs()) {
        out(`  ${color.cyan(spec.name.padEnd(14))} ${color.dim(spec.description)}`);
      }
      return { kind: 'handled' };
    },
  },
  {
    name: 'cwd',
    summary: 'Show the workspace root',
    run: ({ session, out }) => {
      out(`${glyph.bullet} workspace: ${color.cyan(session.config.workspaceRoot)}`);
      return { kind: 'handled' };
    },
  },
  {
    name: 'init',
    summary: 'Generate an AGENTS.md for this repo',
    run: () => ({ kind: 'run', input: INIT_PROMPT }),
  },
  {
    name: 'clear',
    summary: 'Clear the screen and conversation history',
    run: () => ({ kind: 'clear' }),
  },
  { name: 'exit', summary: 'Quit forge', run: () => ({ kind: 'exit' }) },
  { name: 'quit', summary: 'Quit forge', run: () => ({ kind: 'exit' }) },
];

const COMMAND_MAP = new Map(COMMANDS.map((c) => [c.name, c]));

export const commandNames = (): readonly string[] => COMMANDS.map((c) => c.name);

/** Dispatch a parsed command. Unknown commands return an 'unknown' result. */
export const handleCommand = (parsed: ParsedCommand, ctx: CommandContext): CommandResult => {
  const spec = COMMAND_MAP.get(parsed.name);
  if (!spec) return { kind: 'unknown', name: parsed.name };
  return spec.run(ctx);
};
