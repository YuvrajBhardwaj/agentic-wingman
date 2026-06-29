# Forgewright API server image.
# Builds the whole pnpm workspace and runs the Fastify server.
FROM node:22-bookworm-slim

# git + bash are used by the git tools, autopilot, and the terminal/shell tool.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git bash ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile && pnpm build

ENV NODE_ENV=production \
    FORGE_HOST=0.0.0.0 \
    FORGE_PORT=4317

EXPOSE 4317

# Provide config at runtime via -e / --env-file (FORGE_LLM_*, FORGE_SECRET_KEY, …).
# Mount the repo the agent should operate on and set FORGE_WORKSPACE to it.
CMD ["node", "apps/server/dist/index.js"]
