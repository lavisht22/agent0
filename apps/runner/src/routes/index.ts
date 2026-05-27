import type { FastifyInstance } from "fastify";
import { addAuth } from "../lib/auth.js";
import { registerAgentRoutes } from "./agents.js";
import { registerAuthRoutes } from "./auth.js";
import { registerRunsRoutes } from "./runs.js";
import { registerEmbedRoutes } from "./embed.js";
import { registerRefreshMCPRoute } from "./refresh-mcp.js";
import { registerRunRoute } from "./run.js";
import { registerTestRoute } from "./test.js";

export async function registerRoutes(fastify: FastifyInstance) {
	// Internal routes — JWT-authenticated, called by the frontend
	await registerTestRoute(fastify);
	await registerRefreshMCPRoute(fastify);

	// Public API routes — authenticated by `addAuth` (PAT first, then x-api-key).
	// PATs set request.userId; API keys leave it undefined. Routes that mutate
	// state should chain `requireUserId` to block API keys.
	await fastify.register(async (scoped) => {
		addAuth(scoped);
		
		await scoped.register(async (workspaceScoped) => {
			await registerRunRoute(workspaceScoped);
			await registerRunsRoutes(workspaceScoped);
			await registerEmbedRoutes(workspaceScoped);
			await registerAgentRoutes(workspaceScoped);
		}, { prefix: "/api/v1/workspaces/:workspaceId" });

		await registerAuthRoutes(scoped);
	});
}
