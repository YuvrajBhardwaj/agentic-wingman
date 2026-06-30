# `forge` — Forgewright terminal agent

A terminal-native coding agent (think Claude Code / opencode) that drives the
**same in-process agent loop** as the server: workspace context, builtin tools,
permission-gated side effects, and streaming model turns — no server required.

## Run

```bash
pnpm --filter @forgewright/cli build
node apps/cli/dist/index.js            # interactive
node apps/cli/dist/index.js "explain the auth route"   # one-shot
```

During development you can skip the build:

```bash
pnpm --filter @forgewright/cli dev     # tsx src/index.ts
```

Once the workspace is linked, the `forge` bin is available too (`pnpm exec forge`).

## Modes

| Invocation             | Behaviour                                      |
| ---------------------- | ---------------------------------------------- |
| `forge`                | Interactive REPL                               |
| `forge "<request>"`    | One-shot: run once, stream the answer, exit    |
| `forge -p "<request>"` | Explicit one-shot                              |
| `forge -y "<request>"` | One-shot, auto-approve non-destructive actions |
| `forge --help` / `-v`  | Usage / version                                |

## Interactive commands

`/help` · `/model` · `/tools` · `/cwd` · `/init` (generate an `AGENTS.md`) ·
`/clear` · `/exit`. Tab-completes slash commands. **Ctrl+C** cancels an in-flight
run; pressing it again at an idle prompt exits.

## Permissions

Reads are auto-allowed; writes, shell, network, and git changes prompt inline
(`[y]es / [a]lways / [N]o`). "Always" allows that capability for the rest of the
session. **Destructive actions never offer "always"** and always re-prompt.
One-shot runs deny gated actions unless `-y/--yes` is passed.

## Configuration

Model and provider come from the nearest `.env` (walked up from the cwd) via the
standard `FORGE_LLM_*` vars — works with Ollama, LM Studio, Groq, NVIDIA NIM, or
any OpenAI-compatible endpoint. `FORGE_CONTEXT_BUDGET` / `FORGE_AGENT_MAX_TOKENS`
keep rate-limited providers happy. `FORGE_NO_COLOR=1` disables ANSI;
`FORGE_CLI_DEBUG=1` surfaces the structured logs.
