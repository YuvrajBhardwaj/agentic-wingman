# Forgewright

> An open-source, local-first AI engineering companion — a persistent AI operating system that understands your code, documents, conversations, and workflows, coordinates specialized agents, and acts autonomously while keeping you in control.

Forgewright is **not** "another chatbot." It is a modular platform that starts as a senior-engineer-grade coding agent and grows into an AI workspace spanning research, documents, integrations, and automation. Everything is typed, modular, and open.

---

## Why this exists

Modern AI coding assistants are powerful but proprietary, cloud-locked, and narrow. Forgewright aims to be:

- **Local-first** — runs on your machine, your models (Ollama / LM Studio / OpenAI-compatible), your data.
- **Memory-native** — remembers conversations, decisions, preferences, and bugs across sessions.
- **Agentic** — plans, edits, runs, verifies, reflects, and recovers from failures.
- **Permission-gated** — never does anything destructive without your approval.
- **Extensible** — MCP servers, integration plugins, and custom agents all hot-pluggable.

## Guiding principles

1. **Runnable depth over broad scaffolding.** Every milestone ships something that actually works and is tested — no placeholder implementations where a real one is feasible.
2. **Clean architecture + dependency injection.** Subsystems depend on interfaces from `packages/types`, never on each other's internals.
3. **100% TypeScript, strict mode, no `any`.**
4. **The user is always in control.** Approvals, sandboxing, secrets detection, and rollback are first-class, not afterthoughts.
5. **Local-first, cloud-optional.** SQLite + local embeddings work with zero external services; Postgres/Qdrant/cloud LLMs are opt-in upgrades.

---

## High-level architecture

```
apps/
  desktop/        React + Vite + Tailwind UI (VS Code-like layout)
  server/         Fastify API: streaming agent, tools, indexing, jobs

packages/
  types/          Shared contracts/interfaces (the dependency root)
  shared/         Cross-cutting utils: logging, config, errors, DI container
  tools/          Tool framework + JSON schemas + built-in tools
  context/        Repo indexing (Tree-sitter), symbol/dependency graph, context builder
  embeddings/     Embedding providers (bge-small-en-v1.5) + vector store abstraction
  memory/         Long-term memory + knowledge graph (entities & relations)
  agent/          Core agent loop, LLM providers, model router
  planner/        Hierarchical planning (goal -> tasks -> subtasks -> verify -> reflect)
  mcp/            Model Context Protocol client/host, dynamic registration, hot reload
  git/            Snapshots, diff, commit message generation, rollback
  terminal/       Persistent sandboxed shell, streaming, interrupt, approval
  integrations/   Plugin framework (Telegram, Slack, Gmail, ...) with OAuth + sync
  documents/      Document pipeline (PDF/DOCX/XLSX/...): read, extract, OCR, report
  browser/        Browser/web-intelligence agent (Playwright), crawling, extraction
  research/       Research agent: search -> read -> synthesize -> cite
  ui/             Shared React component library + design system
```

**Dependency direction:** `types` <- everything. `shared` <- most. Feature packages depend on `types`/`shared` and inject implementations at the app boundary. No feature package imports another feature package's internals — only its published interface.

---

## Tech stack

| Layer        | Choice                                                          |
| ------------ | --------------------------------------------------------------- |
| Frontend     | React, TypeScript, Tailwind CSS, Vite                           |
| Backend      | Node.js, TypeScript, Fastify                                    |
| Local DB     | SQLite (better-sqlite3)                                         |
| Cloud DB     | PostgreSQL (optional)                                           |
| Vector DB    | Qdrant (optional); in-process HNSW for local mode               |
| Embeddings   | BAAI/bge-small-en-v1.5 (local via transformers.js / Ollama)     |
| LLMs         | OpenAI-compatible APIs, Ollama, LM Studio, DeepSeek, Qwen Coder |
| Code parsing | Tree-sitter (web-tree-sitter / WASM grammars)                   |
| Browser      | Playwright                                                      |
| Testing      | Vitest (unit/integration), Playwright (e2e)                     |
| Quality      | ESLint, Prettier, TypeScript strict                             |
| Monorepo     | pnpm workspaces + Turborepo                                     |

---

## Scope reality-check

The full vision is a multi-quarter platform. This repo is built in **phases** (see [docs/ROADMAP.md](docs/ROADMAP.md)). Each phase is independently useful and fully tested before the next begins.

- **Phase 1 (foundation + coding agent core)** is the current focus.
- Later phases (memory/graph, integrations, documents, browser, research, multi-agent, jobs/workflows, desktop UI) build on the same contracts.

## Status

✅ **All 11 phases are implemented and tested — 201 tests, all offline.** Forgewright:

- **Codes** — indexes a repo (symbol/import graph), retrieves code + long-term memories into context, reasons, calls permission-gated tools, and edits files over a streaming API with an approval round-trip.
- **Remembers** — semantic long-term memory + a knowledge graph; auto-captures runs; hybrid (semantic + keyword) personal-knowledge-base search.
- **Plans & acts autonomously** — hierarchical planner; git snapshot → implement → verify → fix → retry loop with commit-on-success and rollback.
- **Extends** — connects external **MCP servers** (hot-reloadable); a **persistent terminal**; **multi-agent** collaboration across 14 specialist roles.
- **Reads & researches** — a **documents pipeline** (CSV/XLSX/ZIP/images/MD/JSON, table extraction, version compare) and a **research agent** (search → crawl → synthesize → cite, with a confidence score).
- **Integrates & automates** — a plugin framework with real **Telegram/Slack/webhook** clients, a **job scheduler** (notify-on-change), and a **workflow engine** (triggers → steps → actions).
- **UI** — a React chat app: streaming, tool-call cards, inline Approve/Deny, memory panel, command palette (⌘K), resizable VS Code-like layout.

Remaining work is follow-ups noted inline in [docs/ROADMAP.md](docs/ROADMAP.md): PDF/DOCX/OCR readers, a Playwright JS-rendering fetcher, OAuth clients for Gmail/Outlook/Discord/WhatsApp, and desktop packaging — each plugging into an interface that already exists.

### A taste of the API

```
POST /agent/runs            (SSE)   streaming agent run + approvals
POST /agent/autopilot       (SSE)   autonomous edit → verify → fix loop
POST /agents/collaborate            multi-agent team on a goal
GET  /pkb/search?q=                 hybrid knowledge-base search
POST /documents/parse               parse CSV/XLSX/ZIP/images/… (base64)
GET  /git/diff · POST /git/commit   git safety net
GET  /mcp/servers                   connected MCP servers + tools
GET  /integrations                  configured Telegram/Slack/webhook
```

### Connect MCP servers

```bash
FORGE_MCP_SERVERS='[{"name":"github","command":"npx","args":["-y","@modelcontextprotocol/server-github"],"trust":"prompt"}]' \
  pnpm --filter @forgewright/server dev
curl http://127.0.0.1:4317/mcp/servers   # lists connected servers + their tools
```

Their tools appear to the agent as `mcp__<server>__<tool>` and are permission-gated like everything else.

### Autonomous mode

```bash
# Set what "verified" means for your project, then let it run:
FORGE_VERIFY_CMD="pnpm test" pnpm --filter @forgewright/server dev

curl -N -X POST http://127.0.0.1:4317/agent/autopilot \
  -H 'content-type: application/json' \
  -d '{"goal":"make the failing test pass","plan":true,"maxAttempts":3}'
# It snapshots git, implements, runs your verify command, feeds failures back,
# retries, and commits on success. Roll back anytime via /git/rollback.
```

### Run the UI

```bash
pnpm --filter @forgewright/server dev    # API on :4317
pnpm --filter @forgewright/web dev        # UI on :5273 (proxies to the server)
# open http://localhost:5273
```

## Quickstart

```bash
corepack enable pnpm           # or: npm i -g pnpm
pnpm install
pnpm build
pnpm test                      # ~80 tests, all offline (no model needed)

# Run the server (local-first; talks to any OpenAI-compatible or Ollama endpoint)
pnpm --filter @forgewright/server dev
```

Point it at a local model (zero cloud) — e.g. Ollama:

```bash
ollama serve && ollama pull qwen2.5-coder
# defaults already target http://localhost:11434/v1 ; override via .env (see .env.example)
```

Start a streaming agent run:

```bash
curl -N -X POST http://127.0.0.1:4317/agent/runs \
  -H 'content-type: application/json' \
  -d '{"input":"Add a hello() function to src/index.ts and explain what you did"}'
```

You'll receive Server-Sent Events: `message`, `tool_call`, `tool_result`, `approval_required` (for writes/shell), `usage`, and `done`. Approve a gated action:

```bash
curl -X POST http://127.0.0.1:4317/agent/runs/<runId>/approvals/<approvalId> \
  -H 'content-type: application/json' -d '{"approved":true}'
```

## License

Open source (MIT) — intended as an open platform anyone can run, extend, and self-host.
