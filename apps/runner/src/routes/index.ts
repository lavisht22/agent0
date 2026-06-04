import type { FastifyInstance } from "fastify";
import { addAuth } from "../lib/auth.js";
import { registerAgentRoutes } from "./agents.js";
import { registerApiKeysRoutes } from "./api-keys.js";
import { registerAuthRoutes } from "./auth.js";
import { registerEmbedRoutes } from "./embed.js";
import { registerMcpsRoutes } from "./mcps.js";
import { registerPersonalAccessTokensRoutes } from "./personal-access-tokens.js";
import { registerProvidersRoutes } from "./providers.js";
import { registerRefreshMCPRoute } from "./refresh-mcp.js";
import { registerRunsRoutes } from "./runs.js";
import { registerTagsRoutes } from "./tags.js";
import { registerTestRoute } from "./test.js";
import { registerVersionRoute } from "./version.js";
import { registerWorkspacesRoute } from "./workspaces.js";

export async function registerRoutes(fastify: FastifyInstance) {
	// Internal routes — JWT-authenticated, called by the frontend
	await registerTestRoute(fastify);
	await registerRefreshMCPRoute(fastify);

	// Unauthenticated discovery — must be registered outside `addAuth`.
	await registerVersionRoute(fastify);

	// Public API routes — authenticated by `addAuth` (PAT first, then x-api-key).
	// PATs set request.userId; API keys leave it undefined. Routes that mutate
	// state should chain `requireUserId` to block API keys.
	await fastify.register(async (scoped) => {
		addAuth(scoped);

		await scoped.register(
			async (workspaceScoped) => {
				await registerRunsRoutes(workspaceScoped);
				await registerEmbedRoutes(workspaceScoped);
				await registerAgentRoutes(workspaceScoped);
				await registerTagsRoutes(workspaceScoped);
				await registerProvidersRoutes(workspaceScoped);
				await registerMcpsRoutes(workspaceScoped);
				await registerApiKeysRoutes(workspaceScoped);
			},
			{ prefix: "/api/v1/workspaces/:workspaceId" },
		);

		await registerAuthRoutes(scoped);
		await registerWorkspacesRoute(scoped);
		await registerPersonalAccessTokensRoutes(scoped);
	});
}
