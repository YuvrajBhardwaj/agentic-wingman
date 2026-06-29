# Deploying Forgewright

How to run Forgewright in production: the API server, the web UI, secrets, a reverse
proxy, Docker, and the honest operational caveats you need to know before going live.

> Read [RUNNING.md](RUNNING.md) first for the local-dev basics. This doc is about hosting.

---

## 1. What you're deploying

- **API server** (`@forgewright/server`) — a Fastify Node process. Stateless HTTP + SSE.
- **Web UI** (`@forgewright/web`) — a static SPA (Vite build) that talks to the API.

They can run on one host (reverse proxy serves the SPA and forwards `/api`-ish paths to the
server) or separately (SPA on a CDN, API on a server).

---

## 2. Build for production

```bash
pnpm install --frozen-lockfile
pnpm build
# API:  node apps/server/dist/index.js
# UI:   apps/web/dist/  (static files from `pnpm --filter @forgewright/web build`)
```

Run the API under a process manager so it restarts on crash/reboot:

```ini
# /etc/systemd/system/forgewright.service
[Unit]
Description=Forgewright API
After=network.target

[Service]
WorkingDirectory=/opt/forgewright
EnvironmentFile=/opt/forgewright/.env
ExecStart=/usr/bin/node apps/server/dist/index.js
Restart=always
User=forgewright

[Install]
WantedBy=multi-user.target
```

(or `pm2 start apps/server/dist/index.js --name forgewright`).

---

## 3. Configuration & secrets

All config is `FORGE_*` env (see [.env.example](../.env.example)). The server auto-loads a
`.env` in its working directory; in production prefer real env vars / a secrets manager.

**Minimum for production:**

```dotenv
FORGE_HOST=0.0.0.0
FORGE_PORT=4317
FORGE_LLM_BASE_URL=...        # your model endpoint
FORGE_LLM_MODEL=...
FORGE_LLM_API_KEY=...
FORGE_SECRET_KEY=<openssl rand -hex 32>   # REQUIRED if users connect accounts (encrypts OAuth tokens)
FORGE_PUBLIC_URL=https://api.yourdomain   # used to build OAuth callback URLs
FORGE_WEB_URL=https://app.yourdomain      # where the OAuth callback redirects the user
```

> **Never commit secrets.** `.env` is git-ignored; the Docker image ignores it too. Rotate
> `FORGE_SECRET_KEY` carefully — changing it makes previously stored user OAuth tokens
> undecryptable (users must reconnect).

---

## 4. Reverse proxy (TLS + SSE)

Put the API behind TLS. **Server-Sent Events** (`/agent/runs`, `/agent/autopilot`) require
buffering to be **off**. Caddy example:

```caddyfile
api.yourdomain {
    reverse_proxy 127.0.0.1:4317 {
        flush_interval -1   # stream SSE immediately
    }
}

app.yourdomain {
    root * /opt/forgewright/apps/web/dist
    try_files {path} /index.html
    file_server
}
```

nginx equivalent for the API location:

```nginx
location / {
    proxy_pass http://127.0.0.1:4317;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # required for SSE
    chunked_transfer_encoding off;
}
```

The server already sends `X-Accel-Buffering: no` to help nginx. If you serve the SPA and API
on the **same** origin, no CORS config is needed; otherwise add CORS on the server (not yet
built-in — a small addition).

---

## 5. Docker

A [`Dockerfile`](../Dockerfile) for the API server is included.

```bash
docker build -t forgewright .
docker run -p 4317:4317 --env-file .env \
  -v /srv/repos/myproject:/workspace -e FORGE_WORKSPACE=/workspace \
  forgewright
```

`docker-compose.yml`:

```yaml
services:
  api:
    build: .
    ports: ['4317:4317']
    env_file: .env
    environment:
      FORGE_WORKSPACE: /workspace
    volumes:
      - ./repo:/workspace # the repo the agent operates on
    restart: unless-stopped
```

Build the SPA separately and host it on any static host/CDN, pointing it at the API origin.

> The image bundles sources + all deps (simple and reliable). For a smaller image, add a
> multi-stage build that prunes dev dependencies after `pnpm build`.

---

## 6. Connecting accounts (OAuth) in production

For "Sign in / Connect with Google":

1. Create an OAuth client in Google Cloud (type: Web application).
2. Add the authorized redirect URI: **`${FORGE_PUBLIC_URL}/auth/google/callback`**.
3. Set `FORGE_GOOGLE_CLIENT_ID`, `FORGE_GOOGLE_CLIENT_SECRET`, `FORGE_SECRET_KEY`,
   `FORGE_PUBLIC_URL`, and `FORGE_WEB_URL`.
4. Users hit `GET /auth/google/start` → consent → callback → a session token.

**WhatsApp inbound** needs a public HTTPS webhook: register
`${FORGE_PUBLIC_URL}/integrations/webhooks/whatsapp` in the Meta dashboard with
`FORGE_WHATSAPP_VERIFY_TOKEN`.

---

## 7. ⚠️ Production caveats (read before scaling)

Forgewright is feature-complete across its phases but has deliberate, documented gaps for a
hosted multi-tenant deployment:

- **State is in-memory.** Conversations, long-term memory, the repo index, user accounts,
  and sessions live in process memory — **they do not survive a restart and are not shared
  across replicas.** A durable store (SQLite/Postgres) is the next layer; the interfaces
  (`MemoryStore`, `VectorStore`, `AccountStore`) are already in place to swap in.
- **Single process, no horizontal scaling yet.** Because state is in-process, run **one
  instance** until the durable-store + shared-vector-store work lands. Don't put it behind a
  load balancer with multiple replicas.
- **Multi-tenant isolation is partial.** Users can authenticate and connect their own Google
  account (encrypted per user), but the agent/memory/conversations are **not yet partitioned
  per `userId`** — treat the current build as identity + connection, not full tenant
  isolation. See the multi-tenancy note in [CLAUDE.md](../CLAUDE.md).
- **The agent executes code and shell.** Destructive actions are approval-gated and the FS is
  sandboxed to the workspace, but **run it as an unprivileged user in an isolated
  container/VM**, never as root on a shared host. Mount only the repo it should touch.
- **Autopilot auto-approves.** `/agent/autopilot` trusts actions (it snapshots git first).
  Only expose it to trusted callers.

### Recommended hardening

- Dedicated low-privilege user; container with a read-only root FS except the workspace.
- Network egress controls (the agent can make HTTP requests and spawn MCP servers).
- Front the API with auth at the proxy if it isn't user-gated yet.
- Back up nothing sensitive in logs (secrets are never logged; keep it that way).

---

## 8. Health & observability

- `GET /health` → `{ status: "ok", mode, version, uptimeMs }` for liveness/readiness probes.
- Logs are structured JSON on stdout (level via `FORGE_LOG_LEVEL`). Ship them to your log
  stack; key events: `server_listening`, `index_complete`, `mcp_connected`,
  `user_connected_google`, `request_error`.

See also: [RUNNING.md](RUNNING.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [ROADMAP.md](ROADMAP.md).
