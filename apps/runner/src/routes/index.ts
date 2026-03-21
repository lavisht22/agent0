import type { FastifyInstance } from "fastify";
import { addApiKeyAuth } from "../lib/auth.js";
import { registerAgentRoutes } from "./agents.js";
import { registerRunsRoutes } from "./runs.js";
import { registerEmbedRoutes } from "./embed.js";
import { registerRefreshMCPRoute } from "./refresh-mcp.js";
import { registerRunRoute } from "./run.js";
import { registerTestRoute } from "./test.js";

export async function registerRoutes(fastify: FastifyInstance) {
	// Internal routes — JWT-authenticated, called by the frontend
	await registerTestRoute(fastify);
	await registerRefreshMCPRoute(fastify);

	// API-key-authenticated routes (middleware validates key and sets request.workspaceId)
	await fastify.register(async (scoped) => {
		addApiKeyAuth(scoped);
		await registerRunRoute(scoped);
		await registerEmbedRoutes(scoped);
		await registerAgentRoutes(scoped);
		await registerRunsRoutes(scoped);
	});
}
