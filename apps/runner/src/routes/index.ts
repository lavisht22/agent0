import type { FastifyInstance } from "fastify";
import { apiKeyAuth } from "../lib/auth.js";
import { registerAgentRoutes } from "./agents.js";
import { registerEmbedRoutes } from "./embed.js";
import { registerInviteRoute } from "./invite.js";
import { registerRefreshMCPRoute } from "./refresh-mcp.js";
import { registerRunRoute } from "./run.js";
import { registerTestRoute } from "./test.js";

export async function registerRoutes(fastify: FastifyInstance) {
	// JWT-authenticated routes (no API key middleware)
	await registerTestRoute(fastify);
	await registerInviteRoute(fastify);
	await registerRefreshMCPRoute(fastify);

	// API-key-authenticated routes (middleware validates key and sets request.workspaceId)
	await fastify.register(async (scoped) => {
		await scoped.register(apiKeyAuth);
		await registerRunRoute(scoped);
		await registerEmbedRoutes(scoped);
		await registerAgentRoutes(scoped);
	});
}
