# Forgewright — Roadmap & Task List

The platform is delivered in **phases**. Each phase ends in a runnable, tested state. Checkboxes are the live task list.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

**Status:** Phases 1–11 implemented and tested (201 tests, all offline). Remaining items within phases are follow-ups marked inline (PDF/DOCX readers, Playwright JS-render, OAuth integration clients, desktop packaging).

---

## Phase 0 — Planning `[x]`

- [x] Capture vision, architecture, and scope (`README.md`, `docs/ARCHITECTURE.md`)
- [x] Produce phased task list (this file)
- [x] Confirm Phase 1 scope with stakeholder and begin

---

## Phase 1 — Foundation (monorepo + contracts + quality gates) `[x]`

**Goal:** a buildable, lint-clean, tested empty platform that everything plugs into.

- [x] pnpm workspace + Turborepo pipeline (`pnpm build`, `lint`, `test`, `dev`)
- [x] Root TS config (strict, `noUncheckedIndexedAccess`, no `any`), path aliases
- [x] ESLint (typescript-eslint, import rules) + Prettier + editorconfig
- [x] Vitest config (workspace-wide) + coverage
- [x] CI workflow (typecheck + lint + test on push)
- [x] `packages/types` — shared contracts (Tool, LlmProvider, Indexer, MemoryStore, etc.)
- [x] `packages/shared` — DI container, logger, config loader, error types, Result helper, clock
- [x] `apps/server` — Fastify bootstrap, health route, config wiring, graceful shutdown
- [x] Smoke test: server boots, `/health` returns ok, all packages typecheck

**Exit criteria:** `pnpm install && pnpm build && pnpm test` all green. ✅ **Met** — 22 tests pass, build/lint/typecheck clean, server boots and serves `/health`.

---

## Phase 2 — Coding Agent Core _(first working vertical slice)_

**Goal:** "a senior engineer working in your repo" — index, retrieve, reason, call tools, edit files with approval.

### 2a. Tools framework `[x]`

- [x] `Tool` interface + `ToolRegistry` + JSON-schema generation (zod → JSON Schema)
- [x] `PermissionBroker` (allow/prompt/deny policies, destructive never auto-allowed)
- [x] Built-in tools: read file, write file, list dir, regex search, glob
- [x] Built-in tool: execute shell (classified read-only/mutating/destructive, approval-gated)
- [x] Built-in tool: http_request (network, gated)
- [x] Tool unit tests (schema validation, permission gating, temp-repo execution, sandbox escape)

### 2b. Repository indexing & context `[x]`

- [x] `SymbolExtractor` (heuristic TS/JS now; Tree-sitter WASM swap-in planned — same interface)
- [x] Symbol graph (classes/interfaces/types/enums/functions/vars) + imports/exports
- [x] File walker honoring ignored dirs (`node_modules`, `.git`, `dist`, `.forgewright`, …)
- [x] Incremental indexing (content-hash gated; in-memory graph — SQLite persistence in Phase 3)
- [x] `ContextBuilder` — token-budgeted lexical retrieval (semantic ranking in Phase 3)
- [x] Tests: index a fixture repo, assert graph + incremental update + retrieval
- [ ] Tree-sitter (web-tree-sitter + WASM grammars) extractor + `.gitignore` parsing _(follow-up)_

### 2c. LLM layer `[x]`

- [x] `LlmProvider` streaming interface + tool-call protocol
- [x] OpenAI-compatible provider (LM Studio / DeepSeek / Qwen / Ollama `/v1`), split-chunk tool-call assembly
- [x] Ollama native provider (`/api/chat` NDJSON)
- [x] `ModelRouter` (cheap / coding / reasoning / verification roles)
- [x] Fake provider for deterministic tests

### 2d. Agent loop `[x]`

- [x] Core loop: build context → LLM → tool calls (parallel) → feed back → repeat
- [x] Streaming output, max-steps guard, interrupt via `AbortSignal`
- [x] Reasoning/trace events (`message`/`tool_call`/`tool_result`/`usage`/`step`/`done`)
- [x] Integration test: scripted LLM edits a file end-to-end through the loop

### 2e. Server surface `[x]`

- [x] SSE endpoint streaming agent messages + tool events
- [x] Approval round-trip API (pause on `prompt`, resume on user decision)
- [ ] Conversation persistence (SQLite) _(arrives with the storage layer in Phase 3)_

**Exit criteria:** from the server, give a task → agent indexes, reasons, calls tools, edits a file behind approval. ✅ **Met** — verified via SSE integration test + live server boot (indexed 13 files / 76 symbols).

---

## Phase 3 — Embeddings, Memory & Knowledge Graph `[x]`

- [x] `Embedder`: offline deterministic hashing embedder (default) + Ollama embedder (real bge-small)
- [x] `VectorStore`: in-process exact cosine kNN store behind the interface (Qdrant/HNSW swap-in next)
- [x] `MemoryStore`: preferences, decisions, recurring bugs, TODOs, conversations, summaries; forgetable
- [x] Auto-retrieval of memories into agent context; auto-capture of completed runs
- [x] `KnowledgeGraph`: entities (people/companies/projects/repos/files/docs/APIs/tech) + relations + BFS traversal
- [x] Memory REST API (`/memory` store/list/search/forget); wired into DI container
- [x] Tests for store/retrieve/forget + graph traversal + live REST round-trip
- [ ] Qdrant/HNSW vector store, embedding worker queue + cache, hybrid keyword+graph blend _(follow-up)_

---

## Phase 4 — Planning, Git & Autonomous Editing `[x]`

- [x] `Planner` (`@forgewright/planner`): LLM-backed goal → tasks → subtasks; plan rendering + leaf extraction
- [x] `git` package (`@forgewright/git`): temp-index snapshot, diff, generated commit message, rollback (removes files created since)
- [x] Autonomous edit loop (`@forgewright/autopilot`): snapshot → (plan) → implement → verify → feed failure back → retry (configurable cap)
- [x] Auto-commit on success; optional rollback-to-snapshot on give-up
- [x] Server: `/git/{status,diff,commit,snapshot,rollback}` + `/agent/autopilot` (SSE); `FORGE_VERIFY_CMD` config
- [x] Tests: snapshot/rollback on a real temp repo, retry-until-pass loop, git routes over HTTP
- [ ] Reflection feeding memory after each attempt _(follow-up)_

---

## Phase 5 — Terminal, MCP & Model Routing polish `[~]`

- [x] **Full MCP client/host** (`@forgewright/mcp`): JSON-RPC 2.0 over stdio, `initialize`/`tools/list`/`tools/call`, dynamic tool registration into the agent, **hot reload**, per-server trust → permission rules
- [x] MCP tools surfaced to the agent as `mcp__<server>__<tool>` (gated by `mcp.call` capability); `/mcp/servers` + reload endpoints; `FORGE_MCP_SERVERS` config
- [x] Tools: git status/diff/commit (via `/git/*` + git package), run tests/lint/build (autopilot verify), HTTP request + fetch (builtin tools)
- [x] Model routing across roles (`ModelRouter`: cheap/coding/reasoning/verification) — Phase 2
- [x] **Persistent shell** (`@forgewright/terminal`): env/cwd persistence, streaming output, interrupt, sentinel-based exit codes, command classification
- [ ] Runtime model hot-switch endpoint _(follow-up)_

---

## Phase 6 — Web UI (VS Code-like) `[~]` (brought forward — `apps/web`)

- [x] React + Vite + Tailwind shell, dark theme, resizable sidebar
- [x] Streaming chat (SSE), markdown renderer, syntax highlighting, file-change/code viewer
- [x] **Approval UI**: inline Approve/Deny wired to the approval endpoint
- [x] Tool-call cards (input/result, status), token-usage display, interrupt (Stop)
- [x] Memory panel: list, semantic search, forget; auto-refresh after runs
- [x] Dev proxy to the server (same-origin, no CORS); production `vite build`
- [x] Unit/component tests (SSE reader, reducer, client, hook, components)
- [x] **Command palette** (Ctrl/Cmd+K) with filter + keyboard nav
- [ ] Workspace: tabs, multiple repos/conversations, pinned memories, bookmarks
- [ ] Drag-and-drop files; true before/after diff (with git); Playwright e2e
- [ ] Package as desktop app (Electron/Tauri) — currently a web app

---

## Phase 7 — Multi-Agent Collaboration `[x]` (`@forgewright/orchestrator`)

- [x] `AgentCoordinator` + structured `AgentContribution` messaging between agents
- [x] 14 built-in roles: Planner, Researcher, Software/UI/AI/DevOps Engineer, Reviewer, Tester, QA, Security Auditor, Data Analyst, PM, Technical/Research analyst
- [x] Parallel + sequential execution; LLM (or injected) synthesis/merge
- [x] Server `/agents/roles` + `/agents/collaborate`; deterministic tests

---

## Phase 8 — Documents Pipeline `[x]` (`@forgewright/documents`)

- [x] Readers: Markdown, text, JSON, CSV (with tables), **XLSX**, **ZIP**, images (dimensions) — all real, tested
- [x] Capabilities: summarize (LLM), extract tables, version compare, tables→Markdown export
- [x] `DocumentRegistry` dispatch + server `/documents/parse` (base64) + `/documents/formats`
- [ ] PDF/DOCX/PPTX readers (same `DocumentReader` interface) + OCR provider _(follow-up — needs pdf/mammoth/tesseract)_

---

## Phase 9 — Web Intelligence & Research Agent `[x]` (`@forgewright/research`)

- [x] Web intelligence core: HTML→text, link/JSON-LD extraction, sitemap parsing, **multi-page BFS crawler** (transport-agnostic)
- [x] `ResearchAgent`: plan queries → search → fetch → read → synthesize
- [x] Output: executive summary, technical report, inline citations, **confidence score**, source links
- [ ] Playwright `Fetcher` (JS render, login, infinite scroll, CAPTCHA handoff, screenshots) _(needs `playwright install`)_
- [ ] LinkedIn intelligence — **official APIs / user exports only; no ToS-violating scraping** _(deliberately not implemented)_

---

## Phase 10 — Integrations Framework `[x]` (`@forgewright/integrations`, `@forgewright/google`)

- [x] `Integration` plugin contract + `IntegrationManager` (approval gating, deduplicated background sync)
- [x] Real clients: **Telegram** (Bot API, send msg/file, poll), **WhatsApp** (Business Cloud API, send + media + inbound webhook), **Slack** (chat.postMessage), generic **Webhook**
- [x] **Gmail + Google Calendar** (`@forgewright/google`): OAuth refresh-token auth, list/read/send mail, list/create events, daily-agenda builder
- [x] Inbound connector: WhatsApp webhook (verify + receive) + Telegram poller → `WorkflowEngine` triggers; server `/integrations`, `/integrations/:id/send`, `/integrations/webhooks/whatsapp`
- [x] Cloud LLMs: Groq + NVIDIA NIM via the OpenAI-compatible provider; `.env` auto-loaded
- [ ] Discord/Outlook clients + full OAuth consent UI; turnkey "daily briefing" cron job _(follow-up)_

---

## Phase 11 — Background Jobs & Workflow Automation `[x]` (`@forgewright/jobs`)

- [x] `JobScheduler`: interval jobs, **meaningful-change detection** → notify only when it matters
- [x] `WorkflowEngine`: triggers → steps → actions (e.g. "PDF on Telegram → extract → summarize → tasks → memory → email")
- [x] **Personal Knowledge Base**: `HybridSearch` blending semantic + keyword via reciprocal rank fusion (graph/full-text layer in); server `/pkb/search`
- [ ] Prebuilt watchers (repos/RSS/email) wired as scheduled jobs in the server _(follow-up)_

---

## Cross-cutting (every phase)

- [ ] Maintain 100% TypeScript strict, no `any`, ESLint/Prettier clean
- [ ] Tests for new logic; keep CI green
- [ ] Update docs; commit per milestone with clear messages
- [ ] Security review of any new side-effecting capability
