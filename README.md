# agent0

agent0 is an open-source software that allows you to create AI agents, powered by the [Vercel AI SDK](https://sdk.vercel.ai/docs).

It provides a comprehensive platform to build, run, test, and monitor AI agents using various AI providers and models. Designed with a beautiful UI, it enables non-technical teams to easily create agents while allowing technical teams to manage the execution environment.

## Features

- **Multi-Provider Support**: Create agents on top of different AI providers and models.
- **Agent Management**: Run, test, and monitor agent performance and outputs.
- **User-Friendly Interface**: A beautiful and intuitive UI for seamless agent creation.
- **Robust Runner**: A dedicated Node.js runner for hosting the frontend and executing agent runs.

## Tech Stack

### Frontend (`apps/web`)
- **Framework**: [React](https://react.dev/)
- **Routing**: [TanStack Router](https://tanstack.com/router/latest)
- **UI Library**: [Hero UI](https://www.heroui.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)

### Backend (`apps/runner`)
- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Fastify](https://fastify.dev/)

### Database
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)

## Project Structure

This project is organized as a monorepo:

- `apps/web`: The frontend application code.
- `apps/runner`: The Node.js server responsible for hosting the frontend and running AI agents.
- `packages/database`: Shared database configurations and types.

## Use agent0 from your AI tools

Edit prompts, deploy versions, and trigger runs from Claude Code, Cursor, or any agent with shell access — using the [`agent0-cli`](packages/cli) plus a skill that teaches the AI when and how to use it.

```bash
# Install the skill (drops it under .claude/skills/agent0/ and .agents/skills/agent0/)
npx skills add lavisht22/agent0

# The skill installs the CLI on first use, then your AI tool drives it.
```

The CLI can also be installed manually: `npm install -g agent0-cli`.

## Self-Hosting

agent0 ships as a single Docker image (web UI + API together) published to GitHub
Container Registry. The server applies pending database migrations on startup, so
there is no separate migrate step.

You bring your own **Postgres** and **S3-compatible object store** (AWS S3, MinIO,
Cloudflare R2, …); everything else is configured through environment variables.

```bash
# 1. Grab the deploy files
curl -O https://raw.githubusercontent.com/lavisht22/agent0/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/lavisht22/agent0/main/.env.example

# 2. Configure
cp .env.example .env
#    Fill in DATABASE_URL, the S3_* values, and the secrets. Generate the two
#    32-byte secrets with:
openssl rand -base64 32   # CONFIG_ENCRYPTION_KEY
openssl rand -base64 32   # BETTER_AUTH_SECRET

# 3. Run
docker compose up -d
```

The app listens on port `8080`. See [`.env.example`](.env.example) for the full,
documented list of variables.

> ⚠️ **Back up `CONFIG_ENCRYPTION_KEY`.** It encrypts every stored provider
> credential — lose it and those credentials are unrecoverable.

### Deploying on Coolify

Create a **Docker Compose** resource pointing at `docker-compose.yml`. Coolify
provides the reverse proxy and TLS, so set `APP_URL` to your public `https` URL and
let Coolify proxy to port `8080`. The compose file is intentionally
profile-free so it works with Coolify's compose handling.

### Image versions

Images are tagged by SemVer release: `:2.1.0`, `:2.1`, `:2`, and `:latest`. Pin a
specific tag in `docker-compose.yml` for reproducible deploys.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- [pnpm](https://pnpm.io/)
- [Docker](https://www.docker.com/) (Optional, for containerized deployment)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/agent0.git
   cd agent0
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Running the Project

To start the development server for all applications:

```bash
pnpm dev
```

This command will start both the web application and the runner in development mode.

## Database Setup

The project uses PostgreSQL. The schema lives in `packages/database/schema.ts` (Drizzle, the single source of truth); SQL migrations are generated from it with `pnpm --filter @repo/database generate`. Pending migrations are applied automatically when the server boots; you can also apply them manually with `pnpm --filter @repo/database migrate` against `DATABASE_URL`.

## License

[ISC](LICENSE)
