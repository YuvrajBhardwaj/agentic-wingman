#!/usr/bin/env node
import { createTerminalApprover } from './approver.js';
import { loadDotEnv } from './env.js';
import { createCliLogger } from './logger.js';
import { TranscriptRenderer } from './render.js';
import { runRepl } from './repl.js';
import { CliSession } from './session.js';
import { color, glyph } from './theme.js';

interface Args {
  readonly prompt: string;
  readonly oneShot: boolean;
  readonly yes: boolean;
  readonly help: boolean;
  readonly version: boolean;
}

const parseArgs = (argv: readonly string[]): Args => {
  const positional: string[] = [];
  let oneShot = false;
  let yes = false;
  let help = false;
  let version = false;
  for (const arg of argv) {
    if (arg === '-p' || arg === '--print') oneShot = true;
    else if (arg === '-y' || arg === '--yes') yes = true;
    else if (arg === '-h' || arg === '--help') help = true;
    else if (arg === '-v' || arg === '--version') version = true;
    else positional.push(arg);
  }
  const prompt = positional.join(' ').trim();
  return { prompt, oneShot: oneShot || prompt.length > 0, yes, help, version };
};

const USAGE = `${color.bold('forge')} — Forgewright terminal agent

${color.bold('Usage')}
  forge                      Start an interactive session
  forge "<request>"          Run a single request and exit (one-shot)
  forge -p "<request>"       Same, explicit one-shot

${color.bold('Options')}
  -y, --yes      Auto-approve non-destructive actions (one-shot)
  -h, --help     Show this help
  -v, --version  Show version

${color.bold('Interactive commands')}
  /help /model /tools /cwd /init /clear /exit

${color.dim('Configure the model via .env (FORGE_LLM_* — works with Ollama, Groq, etc.).')}`;

const main = async (): Promise<void> => {
  loadDotEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.version) {
    process.stdout.write('forgewright 0.0.1\n');
    return;
  }

  const logger = createCliLogger();
  const out = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  // The interactive approver needs an `ask` only available once the REPL's line
  // reader exists, so we wire it through mutable holders set during startup.
  let ask: (q: string) => Promise<string> = async () => (args.yes ? 'y' : 'n');
  let addRule: CliSession['addPermissionRule'] = () => undefined;

  const approver = createTerminalApprover({
    ask: (q) => ask(q),
    addRule: (rule) => addRule(rule),
    out,
  });

  const session = new CliSession({ logger, approver });
  addRule = (rule) => session.addPermissionRule(rule);

  if (args.oneShot) {
    await runOnce(session, args.prompt);
    return;
  }
  await runRepl({
    session,
    attachApprover: (a) => {
      ask = a;
    },
  });
};

/** Non-interactive single request: stream the answer, then exit. */
const runOnce = async (session: CliSession, prompt: string): Promise<void> => {
  const controller = new AbortController();
  const onSigint = (): void => controller.abort();
  process.on('SIGINT', onSigint);
  const renderer = new TranscriptRenderer((f) => process.stdout.write(f));
  try {
    for await (const event of session.run(prompt, controller.signal)) {
      renderer.handle(event);
    }
  } finally {
    process.off('SIGINT', onSigint);
  }
  const result = renderer.finish();
  if (result.usage.totalTokens > 0) {
    process.stdout.write(color.gray(`${glyph.dot} ${result.usage.totalTokens} tokens\n`));
  }
  if (result.reason === 'error') process.exitCode = 1;
};

void main().catch((error) => {
  process.stderr.write(
    `${color.red('fatal:')} ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
