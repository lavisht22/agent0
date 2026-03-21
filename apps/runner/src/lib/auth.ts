import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "./db.js";

declare module "fastify" {
	interface FastifyRequest {
		workspaceId: string;
	}
}

/**
 * Registers API key auth on the given Fastify instance.
 * Adds a preHandler hook that validates x-api-key and sets request.workspaceId.
 * Call this directly on a scoped instance — not via fastify.register().
 */
export function addApiKeyAuth(fastify: FastifyInstance) {
	fastify.decorateRequest("workspaceId", null as unknown as string);

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
