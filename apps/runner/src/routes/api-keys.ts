import type { FastifyInstance } from "fastify";
import { customAlphabet, nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

// API keys are an admin-only resource. The single Supabase `ALL` RLS policy
// gated every operation — including SELECT — on `is_workspace_admin`, because
// the stored `key` is a plaintext credential. Our scope model only has one
// admin-only shape: `*:*:*`. A `:read:` scope would be matched by readers' and
// writers' `*:read:*` grant and leak the keys, so EVERY endpoint here gates on
// `api_keys:write:*` (matched only by admin's `*:*:*`), faithfully porting that
// single `ALL` policy. `requireUserId` additionally blocks machine API keys.
const ADMIN_SCOPE = "api_keys:write:*";

// Same character space the web used to generate keys client-side. We now mint
// them server-side instead (no weak browser RNG; the key never has to round-trip
// from an untrusted caller), but keep the format identical for parity.
const generateKey = customAlphabet("abcdefghijklmnopqrstuvwxyz1234567890", 21);

const SELECT_COLUMNS =
	"id, key, name, scopes, allowed_origins, user_id, workspace_id, created_at";

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

/** Empty origin list means "any origin" — stored as null, matching the web. */
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

			const { data, error } = await supabase
				.from("api_keys")
				.select(SELECT_COLUMNS)
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: false });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch API keys" });
			}

			return reply.send({ data });
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

			const { data, error } = await supabase
				.from("api_keys")
				.insert({
					id: nanoid(),
					key: generateKey(),
					name: trimmedName,
					workspace_id: workspaceId,
					user_id: userId,
					scopes: cleanScopes(body.scopes),
					allowed_origins: normalizeOrigins(body.allowed_origins),
				})
				.select(SELECT_COLUMNS)
				.single();

			if (error || !data) {
				return reply.code(500).send({ message: "Failed to create API key" });
			}

			return reply.code(201).send({ data });
		},
	});

	fastify.patch("/api-keys/:id", {
		preHandler: [requireScope(ADMIN_SCOPE), requireUserId],
		schema: {
			tags: ["API Keys"],
			summary: "Update an API key",
			params: {
				type: "object" as const,
				properties: { id: { type: "string" as const } },
				required: ["id"],
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
			const { workspaceId, id } = request.params as {
				workspaceId: string;
				id: string;
			};
			const body = request.body as {
				name?: string;
				scopes?: string[];
				allowed_origins?: string[] | null;
			};

			// The key, owner, and workspace are immutable — only name/scopes/origins
			// are editable, mirroring the web update.
			const updates: Record<string, unknown> = {};
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

			const { data, error } = await supabase
				.from("api_keys")
				.update(updates)
				.eq("id", id)
				.eq("workspace_id", workspaceId)
				.select(SELECT_COLUMNS)
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to update API key" });
			}
			if (!data) {
				return reply.code(404).send({ message: "API key not found" });
			}

			return reply.send({ data });
		},
	});

	fastify.delete("/api-keys/:id", {
		preHandler: [requireScope(ADMIN_SCOPE), requireUserId],
		schema: {
			tags: ["API Keys"],
			summary: "Revoke (delete) an API key",
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
				.from("api_keys")
				.delete({ count: "exact" })
				.eq("id", id)
				.eq("workspace_id", workspaceId);

			if (error) {
				return reply.code(500).send({ message: "Failed to delete API key" });
			}
			if (count === 0) {
				return reply.code(404).send({ message: "API key not found" });
			}

			return reply.send({ success: true });
		},
	});
}
