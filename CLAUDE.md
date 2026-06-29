# CLAUDE.md

Guidance for AI assistants (and humans) working in this repository.

## What this is

**Forgewright** — an open-source, local-first AI engineering companion. It begins as a senior-engineer-grade coding agent and grows into an AI workspace (memory, research, documents, integrations, automation). See [README.md](README.md) for the vision and [docs/ROADMAP.md](docs/ROADMAP.md) for the phased plan.

**Current state:** All 11 roadmap phases implemented and tested (201 tests). Remaining items are follow-ups noted in `docs/ROADMAP.md` (PDF/DOCX/OCR readers, Playwright fetcher, OAuth integration clients, desktop packaging) — each plugs into an existing interface.

## Repository layout

```
apps/
  server/         Fastify API (DI-wired): /health, /agent/runs (SSE) + approval, /memory CRUD+search
  web/            React + Vite + Tailwind chat UI: streaming, tool cards, approvals, memory panel
packages/
  types/          Shared contracts — the dependency root. Interfaces only, no logic.
  shared/         DI container, structured logger, config loader, errors, clock, tokens.
  tools/          Tool framework: registry, permission broker, sandboxed fs, 7 builtin tools.
  llm/            LlmProvider impls (OpenAI-compatible, Ollama), ModelRouter, fake provider.
  context/        Repo indexer (symbol/import graph), TS symbol extractor, context builder.
  embeddings/     Embedder (offline hashing + Ollama bge), in-memory cosine VectorStore.
  memory/         VectorMemoryStore (semantic long-term memory) + InMemoryKnowledgeGraph.
  git/            GitRepo: temp-index snapshot, diff, generated commit msg, rollback.
  planner/        LlmPlanner (goal→tasks→subtasks) + plan render/leaf helpers.
  autopilot/      AutonomousRunner (snapshot→implement→verify→fix→retry) + commandVerifier.
  mcp/            MCP client/host: JSON-RPC over stdio, McpClient, McpToolAdapter, McpHost (hot reload).
  terminal/       PersistentShell (env/cwd persistence, streaming, interrupt) + command classification.
  orchestrator/   Multi-agent: AgentCoordinator + 14 specialist RoleDefinitions + synthesis.
  jobs/           JobScheduler (notify-on-change) + WorkflowEngine + HybridSearch (PKB).
  documents/      DocumentRegistry + readers (CSV/XLSX/ZIP/image/MD/JSON) + summarize/compare.
  research/       ResearchAgent (search→fetch→synthesize→cite) + web utils + Crawler.
  integrations/   Plugin framework + Telegram/WhatsApp/Slack/Webhook clients + IntegrationManager.
  google/         Gmail + Google Calendar clients (OAuth refresh) + daily-agenda builder.
  agent/          The agent loop: context + memory → LLM → tools → repeat; system prompt; factory.
```

Server endpoints: `/health`, `/agent/runs` (SSE) + approval, `/agent/autopilot` (SSE; needs `FORGE_VERIFY_CMD`), `/memory` CRUD/search, `/pkb/search`, `/git/*`, `/mcp/servers` (+ reload), `/agents/{roles,collaborate}`, `/documents/{parse,formats}`, `/integrations` (+ `/:id/send`). Config via `FORGE_*` env (MCP servers, integration tokens, verify command).

## How the agent works (Phase 2)

`apps/server` exposes `POST /agent/runs` (SSE). A request builds an `AgentLoop` (`packages/agent`) via `createAgent`, wired with: the builtin `ToolRegistry`, a `ModelRouter` from config, a `PermissionBroker` whose approver bridges to SSE `approval_required` events, a `ContextBuilder` over the workspace index, and a `MemoryStore`. Each run injects relevant code context **and** retrieved long-term memories as system messages, streams a model turn, executes tool calls in parallel (permission-gated), feeds results back, and repeats until done / max-steps / interrupt. Approvals resolve out-of-band via `POST /agent/runs/:runId/approvals/:approvalId`. On completion the run is auto-captured into memory. Memory is also managed directly via `/memory` (POST store, GET list, GET `/memory/search?q=`, DELETE).

## Golden rules

1. **Contracts live in `@forgewright/types`.** Implementations live in feature packages and are wired into the DI container at the app boundary (`apps/server/src/container.ts`). A feature package never imports another feature package's internals — only its published interface.
2. **No `any`.** Strict TypeScript, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` are on. Honor them.
3. **Inject side effects.** Time (`Clock`), logging (`Logger`), config, and stores are injected — never reach for `Date.now()` or `console.log` directly in logic. This keeps everything testable and deterministic.
4. **Every side effect is permission-gated.** Anything touching the filesystem, shell, network, or git flows through the `PermissionBroker`. Destructive actions require approval.
5. **Write tests for new logic.** Co-locate `*.test.ts` next to source. LLM/clock/network are faked in tests; CI runs offline.

## Toolchain

- **Package manager:** pnpm 9 (via corepack). On this machine pnpm is installed globally; if missing, run `corepack enable pnpm` or invoke `corepack pnpm@9.15.0 ...`.
- **Monorepo runner:** Turborepo. `pnpm build | test | lint | typecheck` fan out across packages.
- **Build:** TypeScript project references (`tsc -b`). Each package emits to `dist/`.
- **Dev:** `pnpm dev` (server runs via `tsx watch`).

## Common commands

```bash
pnpm install            # install workspace deps
pnpm build              # tsc -b across all packages (respects ^build order)
pnpm test               # vitest run in every package
pnpm lint               # eslint
pnpm typecheck          # tsc --noEmit
pnpm format             # prettier --write
pnpm --filter @forgewright/server dev   # run just the server in watch mode
```

To run a single package's tests: `pnpm --filter @forgewright/shared test`.

## Conventions

- ESM everywhere (`"type": "module"`); use `.js` extensions in relative imports (NodeNext resolution).
- Use `import type { ... }` for type-only imports (`verbatimModuleSyntax` is on).
- Errors are `ForgewrightError` with a stable `ErrorCode` and structured `context`.
- Public results that can fail without throwing use the `Result<T, E>` type from `@forgewright/types`.
- Config has sane local-mode defaults (SQLite + in-process vectors + local embeddings) and is overridable via `FORGE_*` env vars (see `packages/shared/src/config.ts`).

## When extending

- **New cross-cutting service:** add its interface to `@forgewright/types`, a token to `packages/shared/src/tokens.ts`, the implementation to the owning package, and register it in `apps/server/src/container.ts`.
- **New tool / LLM provider / MCP server / integration:** implement the corresponding interface from `@forgewright/types` and register it — do not special-case it elsewhere.
- Keep `docs/ROADMAP.md` checkboxes current as milestones land.
