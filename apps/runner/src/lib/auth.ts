import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "./db.js";

declare module "fastify" {
	interface FastifyRequest {
		workspaceId: string;
		scopes: string[];
		allowedOrigins: string[] | null;
	}
}

/**
 * Registers API key auth on the given Fastify instance.
 * Adds a preHandler hook that validates x-api-key, enforces the allowed-origins
 * allowlist (if configured), and sets request.workspaceId / scopes / allowedOrigins.
 * Per-route scope checks are done via `requireScope` from ./scopes.js.
 * Call this directly on a scoped instance — not via fastify.register().
 */
export function addApiKeyAuth(fastify: FastifyInstance) {
	fastify.decorateRequest("workspaceId", null as unknown as string);
	fastify.decorateRequest("scopes", null as unknown as string[]);
	fastify.decorateRequest("allowedOrigins", null);

	fastify.addHook(
		"preHandler",
		async (request: FastifyRequest, reply: FastifyReply) => {
			const apiKey = request.headers["x-api-key"] as string;

			if (!apiKey) {
				return reply.code(401).send({ message: "API key is required" });
			}

			const { data: apiKeyData, error } = await supabase
				.from("api_keys")
				.select("workspace_id, scopes, allowed_origins")
				.eq("key", apiKey)
				.single();

			if (error || !apiKeyData) {
				return reply.code(403).send({ message: "Invalid API key" });
			}

			request.workspaceId = apiKeyData.workspace_id;
			request.scopes = apiKeyData.scopes ?? [];
			request.allowedOrigins = apiKeyData.allowed_origins ?? null;

			// Enforce origin allowlist if configured.
			if (request.allowedOrigins && request.allowedOrigins.length > 0) {
				const origin = request.headers.origin as string | undefined;
				if (!origin || !request.allowedOrigins.includes(origin)) {
					return reply
						.code(403)
						.send({ message: "Origin not allowed for this API key" });
				}
			}
		},
	);
}
