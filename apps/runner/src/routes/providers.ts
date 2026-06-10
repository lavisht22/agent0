import { providers } from "@repo/database";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { encryptSecret } from "../lib/crypto.js";
import { db } from "../lib/pg.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

// `encrypted_data_production` is never selected (write-only).
const providerColumns = {
	id: providers.id,
	name: providers.name,
	type: providers.type,
	created_at: providers.created_at,
	updated_at: providers.updated_at,
	encrypted_data_staging: providers.encrypted_data_staging,
};

function toProvider(row: {
	id: string;
	name: string;
	type: string;
	created_at: string;
	updated_at: string;
	encrypted_data_staging: string | null;
}) {
	const { encrypted_data_staging, created_at, updated_at, ...rest } = row;
	return {
		...rest,
		created_at: new Date(created_at).toISOString(),
		updated_at: new Date(updated_at).toISOString(),
		has_staging_config: !!encrypted_data_staging,
	};
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

			try {
				const data = await db
					.select(providerColumns)
					.from(providers)
					.where(eq(providers.workspace_id, workspaceId))
					.orderBy(desc(providers.created_at));

				return reply.send({ data: data.map(toProvider) });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch providers" });
			}
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
					data_production: { type: "string" as const, minLength: 1 },
					data_staging: {
						type: "string" as const,
						minLength: 1,
						nullable: true,
					},
				},
				required: ["name", "type", "data_production"],
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
			const { name, type, data_production, data_staging } = request.body as {
				name: string;
				type: string;
				data_production: string;
				data_staging?: string | null;
			};

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			try {
				const [data] = await db
					.insert(providers)
					.values({
						id: nanoid(),
						workspace_id: workspaceId,
						name: trimmedName,
						type,
						encrypted_data_production: encryptSecret(data_production),
						encrypted_data_staging:
							data_staging != null ? encryptSecret(data_staging) : null,
					})
					.returning(providerColumns);

				if (!data) {
					return reply.code(500).send({ message: "Failed to create provider" });
				}

				return reply.code(201).send({ data: toProvider(data) });
			} catch {
				return reply.code(500).send({ message: "Failed to create provider" });
			}
		},
	});

	fastify.patch("/providers/:providerId", {
		preHandler: [requireScope("providers:write:*"), requireUserId],
		schema: {
			tags: ["Providers"],
			summary: "Update a provider",
			params: {
				type: "object" as const,
				properties: { providerId: { type: "string" as const } },
				required: ["providerId"],
			},
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					type: { type: "string" as const, minLength: 1 },
					data_production: { type: "string" as const, minLength: 1 },
					// null clears the staging override; omitting leaves it untouched.
					data_staging: {
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
			const { workspaceId, providerId } = request.params as {
				workspaceId: string;
				providerId: string;
			};
			const body = request.body as {
				name?: string;
				type?: string;
				data_production?: string;
				data_staging?: string | null;
			};

			const updates: Partial<typeof providers.$inferInsert> = {};
			if (body.name !== undefined) {
				const trimmedName = body.name.trim();
				if (trimmedName.length === 0) {
					return reply.code(400).send({ message: "name must not be empty" });
				}
				updates.name = trimmedName;
			}
			if (body.type !== undefined) updates.type = body.type;
			if (body.data_production !== undefined) {
				updates.encrypted_data_production = encryptSecret(body.data_production);
			}
			if (body.data_staging !== undefined) {
				updates.encrypted_data_staging =
					body.data_staging === null ? null : encryptSecret(body.data_staging);
			}

			if (Object.keys(updates).length === 0) {
				return reply.code(400).send({ message: "No updates provided" });
			}
			updates.updated_at = new Date().toISOString();

			try {
				const [data] = await db
					.update(providers)
					.set(updates)
					.where(
						and(
							eq(providers.id, providerId),
							eq(providers.workspace_id, workspaceId),
						),
					)
					.returning(providerColumns);

				if (!data) {
					return reply.code(404).send({ message: "Provider not found" });
				}

				return reply.send({ data: toProvider(data) });
			} catch {
				return reply.code(500).send({ message: "Failed to update provider" });
			}
		},
	});

	fastify.delete("/providers/:providerId", {
		preHandler: [requireScope("providers:write:*"), requireUserId],
		schema: {
			tags: ["Providers"],
			summary: "Delete a provider",
			params: {
				type: "object" as const,
				properties: { providerId: { type: "string" as const } },
				required: ["providerId"],
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
			const { workspaceId, providerId } = request.params as {
				workspaceId: string;
				providerId: string;
			};

			try {
				const deleted = await db
					.delete(providers)
					.where(
						and(
							eq(providers.id, providerId),
							eq(providers.workspace_id, workspaceId),
						),
					)
					.returning({ id: providers.id });

				if (deleted.length === 0) {
					return reply.code(404).send({ message: "Provider not found" });
				}

				return reply.send({ success: true });
			} catch {
				return reply.code(500).send({ message: "Failed to delete provider" });
			}
		},
	});
}
