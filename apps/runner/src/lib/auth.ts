import type { FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "./db.js";

/**
 * Validates the x-api-key header and returns the workspace_id it belongs to.
 * Sends an error response and returns null if validation fails.
 */
export async function validateApiKey(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<string | null> {
	const apiKey = request.headers["x-api-key"] as string;

	if (!apiKey) {
		reply.code(401).send({ message: "API key is required" });
		return null;
	}

	const { data: apiKeyData, error } = await supabase
		.from("api_keys")
		.select("workspace_id")
		.eq("key", apiKey)
		.single();

	if (error || !apiKeyData) {
		reply.code(403).send({ message: "Invalid API key" });
		return null;
	}

	return apiKeyData.workspace_id;
}
