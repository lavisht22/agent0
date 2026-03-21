import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "./db.js";

declare module "fastify" {
	interface FastifyRequest {
		workspaceId: string;
	}
}

/**
 * Fastify plugin that validates the x-api-key header and attaches workspaceId to the request.
 * Register API-key-authenticated routes inside this plugin's scope.
 */
export async function apiKeyAuth(fastify: FastifyInstance) {
	fastify.decorateRequest("workspaceId", "");

	fastify.addHook(
		"preHandler",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const apiKey = request.headers["x-api-key"] as string;

			if (!apiKey) {
				return reply.code(401).send({ message: "API key is required" });
			}

			const { data: apiKeyData, error } = await supabase
				.from("api_keys")
				.select("workspace_id")
				.eq("key", apiKey)
				.single();

			if (error || !apiKeyData) {
				return reply.code(403).send({ message: "Invalid API key" });
			}

			request.workspaceId = apiKeyData.workspace_id;
		},
	);
}
