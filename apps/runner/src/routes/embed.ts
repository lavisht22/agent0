import { embed, embedMany } from "ai";
import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { decryptMessage } from "../lib/openpgp.js";
import { getAIProvider } from "../lib/providers.js";

/**
 * Model specification for Agent0 embedding requests.
 * Instead of passing an EmbeddingModel instance, pass the provider_id and model name.
 */
interface Agent0EmbedModel {
	provider_id: string;
	name: string;
}

/**
 * Embed request body - extends Vercel AI SDK's embed parameters.
 * Only the `model` property is different (using provider_id + name instead of EmbeddingModel).
 */
type SingleEmbedRequest = Omit<Parameters<typeof embed>[0], "model"> & {
	model: Agent0EmbedModel;
};

/**
 * EmbedMany request body - extends Vercel AI SDK's embedMany parameters.
 * Only the `model` property is different (using provider_id + name instead of EmbeddingModel).
 */
type ManyEmbedRequest = Omit<Parameters<typeof embedMany>[0], "model"> & {
	model: Agent0EmbedModel;
};

// Helper to validate API key and get provider
async function validateAndGetProvider(
	apiKey: string | undefined,
	providerId: string,
) {
	if (!apiKey) {
		return { error: { code: 401, message: "API key is required" } };
	}

	// Validate API key against workspace
	const { data: apiKeyData, error: apiKeyError } = await supabase
		.from("api_keys")
		.select("workspace_id")
		.eq("key", apiKey)
		.single();

	if (apiKeyError || !apiKeyData) {
		return { error: { code: 403, message: "Invalid API key" } };
	}

	// Get provider and verify it belongs to the same workspace
	const { data: provider, error: providerError } = await supabase
		.from("providers")
		.select("*")
		.eq("id", providerId)
		.eq("workspace_id", apiKeyData.workspace_id)
		.single();

	if (providerError || !provider) {
		return { error: { code: 404, message: "Provider not found" } };
	}

	const decrypted = await decryptMessage(provider.encrypted_data);
	const config = JSON.parse(decrypted);
	const aiProvider = getAIProvider(provider.type, config);

	return { provider, aiProvider };
}

export async function registerEmbedRoutes(fastify: FastifyInstance) {
	// Single embedding endpoint
	fastify.post("/api/v1/embed", async (request, reply) => {
		const apiKey = request.headers["x-api-key"] as string;
		const body = request.body as SingleEmbedRequest;

		// Validate request body
		if (!body.model?.provider_id || !body.model?.name) {
			return reply
				.code(400)
				.send({ message: "model.provider_id and model.name are required" });
		}

		if (!body.value) {
			return reply.code(400).send({ message: "value is required" });
		}

		const result = await validateAndGetProvider(apiKey, body.model.provider_id);
		if (result.error) {
			return reply
				.code(result.error.code)
				.send({ message: result.error.message });
		}

		const { provider, aiProvider } = result;

		try {
			const embeddingModel = aiProvider?.embeddingModel(body.model.name);

			if (!embeddingModel) {
				return reply.code(400).send({
					message: `Unsupported provider type for embeddings: ${provider.type}`,
				});
			}

			// Spread all other options from body, replacing model with the resolved embedding model
			const { model: _, ...restOptions } = body;
			const embedResult = await embed({
				...restOptions,
				model: embeddingModel,
			});

			return reply.send({
				embedding: embedResult.embedding,
			});
		} catch (error) {
			console.error("Embed error:", error);
			return reply.code(500).send({
				message:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	});

	// Multiple embeddings endpoint
	fastify.post("/api/v1/embed-many", async (request, reply) => {
		const apiKey = request.headers["x-api-key"] as string;
		const body = request.body as ManyEmbedRequest;

		// Validate request body
		if (!body.model?.provider_id || !body.model?.name) {
			return reply
				.code(400)
				.send({ message: "model.provider_id and model.name are required" });
		}

		if (
			!body.values ||
			!Array.isArray(body.values) ||
			body.values.length === 0
		) {
			return reply
				.code(400)
				.send({ message: "values is required and must be a non-empty array" });
		}

		const result = await validateAndGetProvider(apiKey, body.model.provider_id);
		if (result.error) {
			return reply
				.code(result.error.code)
				.send({ message: result.error.message });
		}

		const { provider, aiProvider } = result;

		try {
			const embeddingModel = aiProvider?.embeddingModel(body.model.name);

			if (!embeddingModel) {
				return reply.code(400).send({
					message: `Unsupported provider type for embeddings: ${provider.type}`,
				});
			}

			// Spread all other options from body, replacing model with the resolved embedding model
			const { model: _, ...restOptions } = body;
			const embedResult = await embedMany({
				...restOptions,
				model: embeddingModel,
			});

			return reply.send({
				embeddings: embedResult.embeddings,
			});
		} catch (error) {
			console.error("EmbedMany error:", error);
			return reply.code(500).send({
				message:
					error instanceof Error ? error.message : "Unknown error occurred",
			});
		}
	});
}
