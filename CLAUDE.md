# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Run all apps in dev mode
pnpm dev

# Frontend (apps/web) - runs on port 2222
pnpm --filter web dev
pnpm --filter web build        # vite build && tsc
pnpm --filter web test         # vitest run
pnpm --filter web lint         # biome lint
pnpm --filter web format       # biome format
pnpm --filter web check        # biome check

# Backend (apps/runner)
pnpm --filter runner dev       # tsx watch src/index.ts
pnpm --filter runner build     # tsc + copy openpgp files

# Database (packages/database) — schema.ts is the source of truth; Drizzle Kit owns migrations
pnpm --filter @repo/database generate   # diff schema.ts → emit a SQL migration under drizzle/
pnpm --filter @repo/database migrate     # apply pending migrations to DATABASE_URL

# SDK (packages/agent0)
pnpm --filter agent0 build    # tsc
```

## Architecture

Monorepo managed with pnpm workspaces. Four packages:

- **apps/web** — React SPA (Vite, TanStack Router with file-based routing, HeroUI, Tailwind CSS). Talks to the runner's HTTP API for all data and agent execution.
- **apps/runner** — Fastify server that hosts the built SPA and exposes `/api/v1/workspaces/:workspaceId/runs`, `/api/v1/test`, `/api/v1/embed`, `/api/v1/refresh-mcp`, and `/api/v1/invite` endpoints. Uses the Vercel AI SDK with multiple provider adapters (OpenAI, Google, XAI, Azure, Bedrock, Vertex). Handles MCP tool integration via `@ai-sdk/mcp`.
- **packages/database** — Drizzle schema (`schema.ts`, the single source of truth) and the SQL migrations Drizzle Kit generates from it under `drizzle/`. Imported as `@repo/database` by other packages. Exposes table objects (use `typeof table.$inferSelect`/`$inferInsert` for row types) and a `Json` helper type.
- **packages/agent0** — TypeScript SDK for calling the agent0 API programmatically. Published as `agent0`.

### Key data flow

1. Frontend fetches agent config from the runner API, sends run requests to `/api/v1/workspaces/:workspaceId/runs`
2. Runner validates API key, loads agent version, decrypts provider credentials (OpenPGP), initializes AI provider
3. Variable substitution applied to agent messages, MCP tools loaded dynamically
4. Response returned as SSE stream or complete JSON

### Important source files

- `apps/runner/src/routes/run.ts` — Main agent execution endpoint
- `apps/runner/src/lib/helpers.ts` — Provider setup, MCP client creation, streaming logic
- `apps/runner/src/lib/providers.ts` — AI provider initialization per type
- `apps/web/src/lib/queries.ts` — React Query definitions for all data fetching
- `apps/web/src/routes/` — File-based routes (TanStack Router); `$` prefix = dynamic segments

## Conventions

- **TypeScript strict mode** across all packages
- **Biome** for linting and formatting: tabs for indentation, double quotes for strings
- **Path alias**: `@/*` maps to `src/*` in the web app
- Workspace packages referenced via `workspace:*` protocol
- Agents have staging and production versions/environments
- Provider credentials are encrypted with OpenPGP before storage
