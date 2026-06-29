# Forgewright — Architecture

This document describes how the system is structured and _why_. It is the reference for every milestone in [ROADMAP.md](ROADMAP.md).

---

## 1. Design tenets

- **Interfaces live in `packages/types`.** Implementations live in feature packages. Apps (`server`, `desktop`) wire concrete implementations into an injection container. This keeps every subsystem swappable (e.g. SQLite memory store vs Postgres; local embeddings vs Qdrant).
- **No hidden global state.** Config, logger, clock, and stores are passed via a typed DI container (`packages/shared`).
- **Everything is async and cancellable.** Long operations accept an `AbortSignal`. The UI can interrupt the agent, a tool, or the shell at any time.
- **Capabilities are gated by a permission broker.** Any side-effecting action (write file, run shell, network, git commit, send message) flows through a single `PermissionBroker` that can auto-allow, prompt, or deny based on policy.

## 2. Core data flow (coding agent)

```
User message
   │
   ▼
ContextEngine.build()  ── retrieves: relevant files, related symbols,
   │                       prior edits, git history, memories  (token-budgeted)
   ▼
AgentLoop.run()
   │   ├─ LLM (via ModelRouter) proposes text + tool calls
   │   ├─ ToolRegistry.execute() each call (PermissionBroker-gated, parallelizable)
   │   ├─ results fed back to LLM
   │   └─ repeat until done / max steps / interrupted
   ▼
Outputs: messages (streamed), file edits (as git snapshots + diffs),
         memory updates, reflection
```

## 3. Package contracts (key interfaces)

Defined in `packages/types`:

- **Tool framework**
  - `Tool<I, O>` — `{ name, description, schema (JSON Schema/zod), permission, execute(input, ctx): Promise<O> }`
  - `ToolRegistry` — register/list/execute; produces the JSON-schema array sent to the LLM.
  - `ToolContext` — `{ cwd, signal, permissions, logger, fs }`.
- **LLM**
  - `LlmProvider` — `chat(request): AsyncIterable<ChatChunk>` (streaming, tool-call aware).
  - `ModelRouter` — picks a provider/model per role: `cheap | coding | reasoning | verification`.
- **Context**
  - `Indexer` — `index(repo)`, `update(changedPaths)`; emits `SymbolGraph` + `FileGraph`.
  - `SymbolExtractor` — Tree-sitter-backed; pluggable per language.
  - `ContextBuilder` — `build(query, budget): ContextBundle`.
- **Embeddings / Vector**
  - `Embedder` — `embed(texts): number[][]`.
  - `VectorStore` — `upsert`, `query`, `delete` (local HNSW or Qdrant).
- **Memory / Graph**
  - `MemoryStore` — store/retrieve/forget typed memories.
  - `KnowledgeGraph` — `addEntity`, `addRelation`, `traverse`, `search`.
- **Planner**
  - `Planner` — `plan(goal): Plan`; `Plan` = tree of `Task`/`Subtask` with status, verification, reflection hooks.
- **Permissions / Git / Terminal / MCP / Integrations** — analogous interface-first contracts.

## 4. Persistence

- **Local mode (default):** SQLite (`better-sqlite3`) for conversations, memories, graph nodes/edges, index metadata; in-process HNSW for vectors; files on disk.
- **Scaled mode (optional):** PostgreSQL + Qdrant behind the same interfaces. Selected by config; zero code changes in feature packages.

## 5. Security model

- **PermissionBroker** mediates all side effects. Policies: `allow`, `prompt`, `deny`, with per-tool and per-pattern rules.
- **Shell sandbox** classifies commands (read-only / mutating / destructive) and requires approval for mutating+ by default; a denylist (e.g. `rm -rf`, `dd`, `mkfs`, force-push) always prompts.
- **Secrets:** `.env` and detected secrets are excluded from indexing/context; a secret-scanner runs on any content leaving the machine.
- **Git safety:** edits are snapshotted before application; every change is reviewable as a diff and reversible.

## 6. Performance

- Incremental indexing keyed by content hash + mtime; only changed files re-parsed/re-embedded.
- Embedding generation runs in a background worker queue.
- LLM responses stream token-by-token to the UI (SSE).
- Independent tool calls execute in parallel; results merged deterministically.
- Caches: parse cache, embedding cache, context-bundle cache, LLM response cache (keyed by prompt hash).

## 7. Extensibility surfaces

1. **Tools** — implement `Tool` and register.
2. **LLM providers** — implement `LlmProvider`.
3. **MCP servers** — declared in config; tools registered dynamically at runtime with hot reload.
4. **Integration plugins** — implement the `Integration` contract (auth, capabilities, sync).
5. **Specialized agents** — declarative role + toolset + system prompt; orchestrated by the multi-agent coordinator.

## 8. Testing strategy

- **Unit (Vitest):** every package's pure logic (schema validation, graph building, context budgeting, planners).
- **Integration (Vitest):** agent loop with a fake `LlmProvider` that scripts tool calls; tool execution against a temp repo.
- **E2E (Playwright):** desktop UI flows once the UI exists.
- **Determinism:** LLM and clock are injected and faked in tests; no network in CI.
