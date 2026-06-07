import { apiKeys } from "@repo/database";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { customAlphabet, nanoid } from "nanoid";
import { db } from "../lib/pg.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

// API keys are an admin-only resource for the whole workspace — including reads,
// since each row holds a plaintext `key`. The scope model only expresses
// "admin-only" as `*:*:*`; any `:read:` scope would also be granted to readers
// and writers (via `*:read:*`) and leak the keys. So every endpoint here gates on
// the write scope, matched only by an admin's `*:*:*`. `requireUserId` keeps
// machine API keys out.
const ADMIN_SCOPE = "api_keys:write:*";

// Keys are minted server-side so the secret never round-trips from the client.
const generateKey = customAlphabet("abcdefghijklmnopqrstuvwxyz1234567890", 21);

const apiKeyColumns = {
	id: apiKeys.id,
	key: apiKeys.key,
	name: apiKeys.name,
	scopes: apiKeys.scopes,
	allowed_origins: apiKeys.allowed_origins,
	user_id: apiKeys.user_id,
	workspace_id: apiKeys.workspace_id,
	created_at: apiKeys.created_at,
};

function toApiKey(row: {
	id: string;
	key: string;
	name: string;
	scopes: string[];
	allowed_origins: string[] | null;
	user_id: string;
	workspace_id: string;
	created_at: string;
}) {
	return { ...row, created_at: new Date(row.created_at).toISOString() };
}

const ApiKeySchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		key: { type: "string" as const },
		name: { type: "string" as const },
		scopes: { type: "array" as const, items: { type: "string" as const } },
		allowed_origins: {
			type: "array" as const,
			items: { type: "string" as const },
			nullable: true,
		},
		user_id: { type: "string" as const },
		workspace_id: { type: "string" as const },
		created_at: { type: "string" as const, format: "date-time" },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

/** An empty origin list means "any origin" — stored as null. */
function normalizeOrigins(origins?: string[] | null): string[] | null {
	if (!origins) return null;
	const cleaned = origins.map((o) => o.trim()).filter(Boolean);
	return cleaned.length > 0 ? cleaned : null;
}

function cleanScopes(scopes?: string[]): string[] {
	if (!scopes) return [];
	return scopes.map((s) => s.trim()).filter(Boolean);
}

export async function registerApiKeysRoutes(fastify: FastifyInstance) {
	fastify.get("/api-keys", {
		preHandler: [requireScope(ADMIN_SCOPE), requireUserId],
		schema: {
			tags: ["API Keys"],
			summary: "List API keys",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: ApiKeySchema },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			try {
				const data = await db
					.select(apiKeyColumns)
					.from(apiKeys)
					.where(eq(apiKeys.workspace_id, workspaceId))
					.orderBy(desc(apiKeys.created_at));

				return reply.send({ data: data.map(toApiKey) });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch API keys" });
			}
		},
	});

	fastify.post("/api-keys", {
		preHandler: [requireScope(ADMIN_SCOPE), requireUserId],
		schema: {
			tags: ["API Keys"],
			summary: "Create an API key",
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					scopes: {
						type: "array" as const,
						items: { type: "string" as const },
					},
					allowed_origins: {
						type: "array" as const,
						items: { type: "string" as const },
						nullable: true,
					},
				},
				required: ["name"],
				additionalProperties: false,
			},
			response: {
				201: {
					type: "object" as const,
					properties: { data: ApiKeySchema },
				},
				400: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const body = request.body as {
				name: string;
				scopes?: string[];
				allowed_origins?: string[] | null;
			};

			const trimmedName = body.name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			// `requireUserId` guarantees a user-kind principal, so `userId` is set.
			const userId = request.userId as string;

			try {
				const [data] = await db
					.insert(apiKeys)
					.values({
						id: nanoid(),
						key: generateKey(),
						name: trimmedName,
						workspace_id: workspaceId,
						user_id: userId,
						scopes: cleanScopes(body.scopes),
						allowed_origins: normalizeOrigins(body.allowed_origins),
					})
					.returning(apiKeyColumns);

				if (!data) {
					return reply.code(500).send({ message: "Failed to create API key" });
				}

				return reply.code(201).send({ data: toApiKey(data) });
			} catch {
				return reply.code(500).send({ message: "Failed to create API key" });
			}
		},
	});

	fastify.patch("/api-keys/:apiKeyId", {
		preHandler: [requireScope(ADMIN_SCOPE), requireUserId],
		schema: {
			tags: ["API Keys"],
			summary: "Update an API key",
			params: {
				type: "object" as const,
				properties: { apiKeyId: { type: "string" as const } },
				required: ["apiKeyId"],
			},
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					scopes: {
						type: "array" as const,
						items: { type: "string" as const },
					},
					allowed_origins: {
						type: "array" as const,
						items: { type: "string" as const },
						nullable: true,
					},
				},
				additionalProperties: false,
			},
			response: {
				200: {
					type: "object" as const,
					properties: { data: ApiKeySchema },
				},
				400: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, apiKeyId } = request.params as {
				workspaceId: string;
				apiKeyId: string;
			};
			const body = request.body as {
				name?: string;
				scopes?: string[];
				allowed_origins?: string[] | null;
			};

			// The key, owner, and workspace are immutable — only name/scopes/origins
			// are editable.
			const updates: Partial<typeof apiKeys.$inferInsert> = {};
			if (body.name !== undefined) {
				const trimmedName = body.name.trim();
				if (trimmedName.length === 0) {
					return reply.code(400).send({ message: "name must not be empty" });
				}
				updates.name = trimmedName;
			}
			if (body.scopes !== undefined) {
				updates.scopes = cleanScopes(body.scopes);
			}
			if (body.allowed_origins !== undefined) {
				updates.allowed_origins = normalizeOrigins(body.allowed_origins);
			}

			if (Object.keys(updates).length === 0) {
				return reply.code(400).send({ message: "No updates provided" });
			}

			let data:
				| {
						id: string;
						key: string;
						name: string;
						scopes: string[];
						allowed_origins: string[] | null;
						user_id: string;
						workspace_id: string;
						created_at: string;
				  }
				| undefined;
			try {
				[data] = await db
					.update(apiKeys)
					.set(updates)
					.where(
						and(
							eq(apiKeys.id, apiKeyId),
							eq(apiKeys.workspace_id, workspaceId),
						),
					)
					.returning(apiKeyColumns);
			} catch {
				return reply.code(500).send({ message: "Failed to update API key" });
			}
			if (!data) {
				return reply.code(404).send({ message: "API key not found" });
			}

			return reply.send({ data: toApiKey(data) });
		},
	});

	fastify.delete("/api-keys/:apiKeyId", {
		preHandler: [requireScope(ADMIN_SCOPE), requireUserId],
		schema: {
			tags: ["API Keys"],
			summary: "Revoke (delete) an API key",
			params: {
				type: "object" as const,
				properties: { apiKeyId: { type: "string" as const } },
				required: ["apiKeyId"],
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
			const { workspaceId, apiKeyId } = request.params as {
				workspaceId: string;
				apiKeyId: string;
			};

			let deleted: { id: string }[];
			try {
				deleted = await db
					.delete(apiKeys)
					.where(
						and(
							eq(apiKeys.id, apiKeyId),
							eq(apiKeys.workspace_id, workspaceId),
						),
					)
					.returning({ id: apiKeys.id });
			} catch {
				return reply.code(500).send({ message: "Failed to delete API key" });
			}
			if (deleted.length === 0) {
				return reply.code(404).send({ message: "API key not found" });
			}

			return reply.send({ success: true });
		},
	});
}
