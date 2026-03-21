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

// Helper to get provider scoped to the authenticated workspace
async function getProvider(workspaceId: string, providerId: string) {
	const { data: provider, error: providerError } = await supabase
		.from("providers")
		.select("*")
		.eq("id", providerId)
		.eq("workspace_id", workspaceId)
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
	fastify.post("/api/v1/embed", {
		schema: {
			tags: ["Embeddings"],
			summary: "Generate a single embedding",
			body: {
				type: "object" as const,
				required: ["model", "value"],
				properties: {
					model: {
						type: "object" as const,
						required: ["provider_id", "name"],
						properties: {
							provider_id: { type: "string" as const, description: "Provider ID for the embedding model" },
							name: { type: "string" as const, description: "Model name" },
						},
					},
					value: { type: "string" as const, description: "Text to embed" },
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						embedding: { type: "array" as const, items: { type: "number" as const } },
					},
				},
				400: { type: "object" as const, properties: { message: { type: "string" as const } } },
				404: { type: "object" as const, properties: { message: { type: "string" as const } } },
				500: { type: "object" as const, properties: { message: { type: "string" as const } } },
			},
		},
		handler: async (request, reply) => {
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

		const result = await getProvider(request.workspaceId, body.model.provider_id);
		if (result.error) {
			return reply
				.code(result.error.code as 404)
				.send({ message: result.error.message });
		}

		const { provider, aiProvider } = result;

		try {
			const embeddingModel = aiProvider?.textEmbeddingModel(body.model.name);

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
		},
	});

	// Multiple embeddings endpoint
	fastify.post("/api/v1/embed-many", {
		schema: {
			tags: ["Embeddings"],
			summary: "Generate multiple embeddings",
			body: {
				type: "object" as const,
				required: ["model", "values"],
				properties: {
					model: {
						type: "object" as const,
						required: ["provider_id", "name"],
						properties: {
							provider_id: { type: "string" as const, description: "Provider ID for the embedding model" },
							name: { type: "string" as const, description: "Model name" },
						},
					},
					values: { type: "array" as const, items: { type: "string" as const }, description: "Array of texts to embed" },
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						embeddings: { type: "array" as const, items: { type: "array" as const, items: { type: "number" as const } } },
					},
				},
				400: { type: "object" as const, properties: { message: { type: "string" as const } } },
				404: { type: "object" as const, properties: { message: { type: "string" as const } } },
				500: { type: "object" as const, properties: { message: { type: "string" as const } } },
			},
		},
		handler: async (request, reply) => {
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

		const result = await getProvider(request.workspaceId, body.model.provider_id);
		if (result.error) {
			return reply
				.code(result.error.code as 404)
				.send({ message: result.error.message });
		}

		const { provider, aiProvider } = result;

		try {
			const embeddingModel = aiProvider?.textEmbeddingModel(body.model.name);

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
		},
	});
}
