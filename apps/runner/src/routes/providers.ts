import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

// Provider config is encrypted client-side with the PGP public key before it
// ever reaches the runner; these endpoints persist the opaque armored blobs as
// the browser used to write them directly. The private key lives only on the
// runner's run path (helpers.ts), so create/update never see plaintext.
const SELECT_COLUMNS =
	"id, name, type, created_at, updated_at, encrypted_data_staging";

function toProvider(row: {
	encrypted_data_staging: unknown;
	[key: string]: unknown;
}) {
	const { encrypted_data_staging, ...rest } = row;
	return { ...rest, has_staging_config: !!encrypted_data_staging };
}

const ProviderSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		type: { type: "string" as const },
		has_staging_config: { type: "boolean" as const },
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerProvidersRoutes(fastify: FastifyInstance) {
	fastify.get("/providers", {
		preHandler: requireScope("providers:read:*"),
		schema: {
			tags: ["Providers"],
			summary: "List providers",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: ProviderSchema },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			const { data, error } = await supabase
				.from("providers")
				.select(SELECT_COLUMNS)
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch providers" });
			}

			return reply.send({ data: data.map(toProvider) });
		},
	});

	fastify.post("/providers", {
		preHandler: [requireScope("providers:write:*"), requireUserId],
		schema: {
			tags: ["Providers"],
			summary: "Create a provider",
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					type: { type: "string" as const, minLength: 1 },
					encrypted_data_production: { type: "string" as const, minLength: 1 },
					encrypted_data_staging: {
						type: "string" as const,
						minLength: 1,
						nullable: true,
					},
				},
				required: ["name", "type", "encrypted_data_production"],
				additionalProperties: false,
			},
			response: {
				201: {
					type: "object" as const,
					properties: { data: ProviderSchema },
				},
				400: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const { name, type, encrypted_data_production, encrypted_data_staging } =
				request.body as {
					name: string;
					type: string;
					encrypted_data_production: string;
					encrypted_data_staging?: string | null;
				};

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const { data, error } = await supabase
				.from("providers")
				.insert({
					id: nanoid(),
					workspace_id: workspaceId,
					name: trimmedName,
					type,
					encrypted_data_production,
					encrypted_data_staging: encrypted_data_staging ?? null,
				})
				.select(SELECT_COLUMNS)
				.single();

			if (error || !data) {
				return reply.code(500).send({ message: "Failed to create provider" });
			}

			return reply.code(201).send({ data: toProvider(data) });
		},
	});

	fastify.patch("/providers/:id", {
		preHandler: [requireScope("providers:write:*"), requireUserId],
		schema: {
			tags: ["Providers"],
			summary: "Update a provider",
			params: {
				type: "object" as const,
				properties: { id: { type: "string" as const } },
				required: ["id"],
			},
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					type: { type: "string" as const, minLength: 1 },
					encrypted_data_production: { type: "string" as const, minLength: 1 },
					// null clears the staging override; omitting leaves it untouched.
					encrypted_data_staging: {
						type: "string" as const,
						minLength: 1,
						nullable: true,
					},
				},
				additionalProperties: false,
			},
			response: {
				200: {
					type: "object" as const,
					properties: { data: ProviderSchema },
				},
				400: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, id } = request.params as {
				workspaceId: string;
				id: string;
			};
			const body = request.body as {
				name?: string;
				type?: string;
				encrypted_data_production?: string;
				encrypted_data_staging?: string | null;
			};

			const updates: Record<string, unknown> = {};
			if (body.name !== undefined) {
				const trimmedName = body.name.trim();
				if (trimmedName.length === 0) {
					return reply.code(400).send({ message: "name must not be empty" });
				}
				updates.name = trimmedName;
			}
			if (body.type !== undefined) updates.type = body.type;
			if (body.encrypted_data_production !== undefined) {
				updates.encrypted_data_production = body.encrypted_data_production;
			}
			if (body.encrypted_data_staging !== undefined) {
				updates.encrypted_data_staging = body.encrypted_data_staging;
			}

			if (Object.keys(updates).length === 0) {
				return reply.code(400).send({ message: "No updates provided" });
			}
			updates.updated_at = new Date().toISOString();

			const { data, error } = await supabase
				.from("providers")
				.update(updates)
				.eq("id", id)
				.eq("workspace_id", workspaceId)
				.select(SELECT_COLUMNS)
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to update provider" });
			}
			if (!data) {
				return reply.code(404).send({ message: "Provider not found" });
			}

			return reply.send({ data: toProvider(data) });
		},
	});

	fastify.delete("/providers/:id", {
		preHandler: [requireScope("providers:write:*"), requireUserId],
		schema: {
			tags: ["Providers"],
			summary: "Delete a provider",
			params: {
				type: "object" as const,
				properties: { id: { type: "string" as const } },
				required: ["id"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: { success: { type: "boolean" as const } },
				},
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, id } = request.params as {
				workspaceId: string;
				id: string;
			};

			const { error, count } = await supabase
				.from("providers")
				.delete({ count: "exact" })
				.eq("id", id)
				.eq("workspace_id", workspaceId);

			if (error) {
				return reply.code(500).send({ message: "Failed to delete provider" });
			}
			if (count === 0) {
				return reply.code(404).send({ message: "Provider not found" });
			}

			return reply.send({ success: true });
		},
	});
}
