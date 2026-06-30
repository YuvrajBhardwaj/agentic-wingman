# Running Forgewright

How to run Forgewright locally — the API server, the web UI, and the model behind it.

> TL;DR: `pnpm install && pnpm build && pnpm dev` (or `npm install && npm run build && npm run dev`), then open <http://localhost:5273>. Point it at a local model (Ollama) or a cloud key (Groq/NVIDIA).

---

## 1. Prerequisites

| Tool    | Version | Notes                                                                                          |
| ------- | ------- | ---------------------------------------------------------------------------------------------- |
| Node.js | ≥ 20.12 | `process.loadEnvFile` (auto `.env`) needs 20.12+. Node 22/24 fine.                             |
| pnpm    | ≥ 9     | Recommended. `corepack enable pnpm`, or `npm i -g pnpm`. **npm 7+ also works** — same scripts. |
| git     | any     | Used by the git tools, autopilot snapshots, and the agent.                                     |
| bash    | any     | Used by the persistent terminal and shell tool (Git Bash on Windows).                          |
| A model | —       | Local (Ollama / LM Studio) **or** a cloud key (Groq / NVIDIA / etc.).                          |

> **Windows note:** if `corepack enable pnpm` fails with EPERM (Node in `Program Files`), use `npm i -g pnpm` instead, or run commands via `corepack pnpm@9 …`.

---

## 2. Install, build, test

```bash
corepack enable pnpm      # or: npm i -g pnpm
pnpm install
pnpm build                # tsc -b across all packages
pnpm test                 # full suite, fully offline (no model needed)
```

**Or with npm (npm 7+ — same scripts, no pnpm needed):**

```bash
npm install
npm run build
npm test
```

Other workspace scripts (identical under both): `lint`, `typecheck`, `format`, `clean`.

> **Don't mix pnpm and npm in one checkout** — they use different `node_modules`
> layouts and trip over each other. To switch, wipe first:
> `rm -rf node_modules apps/*/node_modules packages/*/node_modules`, then install
> with the one you want. `pnpm-lock.yaml` is the committed lockfile; npm's
> `package-lock.json` is generated locally and git-ignored.
>
> **Turborepo** remains available as an optional caching accelerator:
> `pnpm turbo:build` / `pnpm turbo:test`. (On some Windows + npm setups turbo's
> native binary won't launch; the default `tsc -b`/`vitest` scripts avoid it.)

---

## 3. Run it

Run the API and the UI in two terminals:

```bash
# terminal 1 — API server on :4317
pnpm dev                              # or: npm run dev          (tsx watch)

# terminal 2 — Web UI on :5273 (proxies API calls to :4317)
pnpm --filter @forgewright/web dev    # or: npm run dev -w @forgewright/web
```

Open <http://localhost:5273>.

### Production-style (built, not watched) — most reliable on Windows

`tsx watch` can be flaky on some Windows setups; the built server is rock-solid:

```bash
pnpm build                               # or: npm run build
node apps/server/dist/index.js           # serves the API on :4317
pnpm --filter @forgewright/web preview   # or: npm run preview -w @forgewright/web
```

### Terminal agent (no server needed)

```bash
node apps/cli/dist/index.js              # interactive REPL
node apps/cli/dist/index.js "fix the failing test"   # one-shot
```

---

## 4. Point it at a model

Forgewright talks to any **OpenAI-compatible** endpoint or **Ollama**. Configure via a
`.env` file in the repo root (the server auto-loads it) — copy [.env.example](../.env.example).

### Local, zero-cloud (Ollama)

```bash
ollama serve
ollama pull qwen2.5-coder        # a tool-calling coding model
# defaults already target http://localhost:11434/v1 — nothing else to set
```

### Groq Cloud

```dotenv
FORGE_LLM_BASE_URL=https://api.groq.com/openai/v1
FORGE_LLM_MODEL=llama-3.3-70b-versatile
FORGE_LLM_API_KEY=gsk_...
```

### NVIDIA NIM

```dotenv
FORGE_LLM_BASE_URL=https://integrate.api.nvidia.com/v1
FORGE_LLM_MODEL=meta/llama-3.3-70b-instruct
FORGE_LLM_API_KEY=nvapi-...
```

> Pick a model that supports **tool/function calling** (the agent relies on it). Embeddings
> stay **local and offline** by default, so memory/search work with no extra setup.

---

## 5. Try it from the terminal

```bash
# Stream an agent run (SSE): message, tool_call, tool_result, approval_required, done
curl -N -X POST http://localhost:4317/agent/runs \
  -H 'content-type: application/json' \
  -d '{"input":"List the TypeScript files in src and summarize the structure"}'

# Multi-agent collaboration
curl -X POST http://localhost:4317/agents/collaborate \
  -H 'content-type: application/json' \
  -d '{"goal":"Design a rate limiter","agents":["planner","software-engineer","reviewer"]}'

# Parse a document (base64)
curl -X POST http://localhost:4317/documents/parse \
  -H 'content-type: application/json' \
  -d "{\"filename\":\"data.csv\",\"base64\":\"$(printf 'a,b\n1,2' | base64)\"}"

# Hybrid knowledge-base search
curl 'http://localhost:4317/pkb/search?q=which%20web%20framework'
```

The agent pauses on writes/shell with an `approval_required` event; approve via:

```bash
curl -X POST http://localhost:4317/agent/runs/<runId>/approvals/<approvalId> \
  -H 'content-type: application/json' -d '{"approved":true}'
```

---

## 6. Optional capabilities (env-gated)

All set in `.env` (see [.env.example](../.env.example)):

| Capability               | Env                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------- |
| **Autopilot** verify cmd | `FORGE_VERIFY_CMD="pnpm test"` → `POST /agent/autopilot`                              |
| **MCP servers**          | `FORGE_MCP_SERVERS=[{"name":"github","command":"npx","args":[...],"trust":"prompt"}]` |
| **Telegram**             | `FORGE_TELEGRAM_TOKEN` (send + inbound polling)                                       |
| **WhatsApp**             | `FORGE_WHATSAPP_PHONE_ID`, `FORGE_WHATSAPP_TOKEN`, `FORGE_WHATSAPP_VERIFY_TOKEN`      |
| **Slack / Webhook**      | `FORGE_SLACK_TOKEN`, `FORGE_WEBHOOK_URL`                                              |
| **Sign in with Google**  | `FORGE_GOOGLE_CLIENT_ID`, `FORGE_GOOGLE_CLIENT_SECRET`, `FORGE_SECRET_KEY` (hex 32)   |

Generate a secret key for encrypting per-user OAuth tokens:

```bash
openssl rand -hex 32      # → FORGE_SECRET_KEY
```

---

## 7. Which repo does the agent work on?

By default the agent operates on the **current working directory**. Point it elsewhere with:

```dotenv
FORGE_WORKSPACE=/path/to/your/project
```

---

## 8. Troubleshooting

- **`pnpm: command not found`** → `corepack enable pnpm` or `npm i -g pnpm`.
- **Turbo: "Unable to find package manager binary"** → pnpm isn't on PATH; install it globally.
- **Agent errors talking to the model** → check `FORGE_LLM_BASE_URL`/`MODEL`/`API_KEY`, and that the model supports tool calling. Watch the server log (`server_listening`, request errors).
- **`secret_key_missing` warning** → set `FORGE_SECRET_KEY` so user OAuth tokens survive restarts.
- **UI can't reach the API** → run the server on `:4317` (or set `FORGE_API_URL` for the Vite proxy).

See also: [README](../README.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DEPLOY](DEPLOY.md) · [ROADMAP](ROADMAP.md).
