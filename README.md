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
- **Database**: [Supabase](https://supabase.com/)

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

The project uses Supabase as the database. The schema is currently evolving and will be checked into the repository once it reaches a stable state.

## License

[ISC](LICENSE)
