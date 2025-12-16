import type { FastifyInstance } from "fastify";
import { registerEmbedRoutes } from "./embed.js";
import { registerInviteRoute } from "./invite.js";
import { registerRefreshMCPRoute } from "./refresh-mcp.js";
import { registerRunRoute } from "./run.js";
import { registerTestRoute } from "./test.js";

export async function registerRoutes(fastify: FastifyInstance) {
	await registerTestRoute(fastify);
	await registerRunRoute(fastify);
	await registerInviteRoute(fastify);
	await registerRefreshMCPRoute(fastify);
	await registerEmbedRoutes(fastify);
}
