import { createHash } from "node:crypto";
import { personalAccessTokens } from "@repo/database";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { customAlphabet, nanoid } from "nanoid";
import { userPrincipal } from "../lib/auth.js";
import { db } from "../lib/pg.js";
import { requireUserId } from "../lib/scopes.js";

// PATs are user-bound, not workspace-bound. Authorization is "a user manages
// only their own tokens", enforced by filtering every query on the principal's
// `userId`; `requireUserId` keeps machine API keys (no user identity) out.

const TOKEN_PREFIX = "agent0_pat_";
// Prefix + 4 chars: enough to tell tokens apart in the list without the secret.
const PREFIX_DISPLAY_LEN = TOKEN_PREFIX.length + 4;

// URL-/shell-safe alphabet (no +, /, =), minted server-side.
const tokenRandom = customAlphabet(
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	32,
);

function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

// Never expose token_hash; the raw token is returned once, from create.
const patColumns = {
	id: personalAccessTokens.id,
	name: personalAccessTokens.name,
	token_prefix: personalAccessTokens.token_prefix,
	created_at: personalAccessTokens.created_at,
	last_used_at: personalAccessTokens.last_used_at,
	expires_at: personalAccessTokens.expires_at,
	revoked_at: personalAccessTokens.revoked_at,
};

const isoOrNull = (value: string | null) =>
	value ? new Date(value).toISOString() : null;

function toPat(row: {
	id: string;
	name: string;
	token_prefix: string;
	created_at: string;
	last_used_at: string | null;
	expires_at: string | null;
	revoked_at: string | null;
}) {
	return {
		...row,
		created_at: new Date(row.created_at).toISOString(),
		last_used_at: isoOrNull(row.last_used_at),
		expires_at: isoOrNull(row.expires_at),
		revoked_at: isoOrNull(row.revoked_at),
	};
}

const PatSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		token_prefix: { type: "string" as const },
		created_at: { type: "string" as const, format: "date-time" },
		last_used_at: {
			type: "string" as const,
			format: "date-time",
			nullable: true,
		},
		expires_at: {
			type: "string" as const,
			format: "date-time",
			nullable: true,
		},
		revoked_at: {
			type: "string" as const,
			format: "date-time",
			nullable: true,
		},
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerPersonalAccessTokensRoutes(
	fastify: FastifyInstance,
) {
	fastify.get("/api/v1/personal-access-tokens", {
		preHandler: requireUserId,
		schema: {
			tags: ["Personal Access Tokens"],
			summary: "List the caller's active personal access tokens",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: PatSchema },
					},
				},
				403: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const userId = userPrincipal(request).userId;

			try {
				const data = await db
					.select(patColumns)
					.from(personalAccessTokens)
					.where(
						and(
							eq(personalAccessTokens.user_id, userId),
							isNull(personalAccessTokens.revoked_at),
						),
					)
					.orderBy(desc(personalAccessTokens.created_at));

				return reply.send({ data: data.map(toPat) });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch tokens" });
			}
		},
	});

	// The raw secret is returned exactly once.
	fastify.post("/api/v1/personal-access-tokens", {
		preHandler: requireUserId,
		schema: {
			tags: ["Personal Access Tokens"],
			summary: "Create a personal access token",
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
				},
				required: ["name"],
				additionalProperties: false,
			},
			response: {
				201: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								...PatSchema.properties,
								token: { type: "string" as const },
							},
						},
					},
				},
				400: ErrorSchema,
				403: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const userId = userPrincipal(request).userId;
			const { name } = request.body as { name: string };

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const token = `${TOKEN_PREFIX}${tokenRandom()}`;

			try {
				const [data] = await db
					.insert(personalAccessTokens)
					.values({
						id: nanoid(),
						user_id: userId,
						token_hash: sha256Hex(token),
						token_prefix: token.slice(0, PREFIX_DISPLAY_LEN),
						name: trimmedName,
					})
					.returning(patColumns);

				if (!data) {
					return reply.code(500).send({ message: "Failed to create token" });
				}

				return reply.code(201).send({ data: { ...toPat(data), token } });
			} catch {
				return reply.code(500).send({ message: "Failed to create token" });
			}
		},
	});

	// Soft delete (sets revoked_at) so audit history survives; the `user_id`
	// filter is the authorization.
	fastify.delete("/api/v1/personal-access-tokens/:tokenId", {
		preHandler: requireUserId,
		schema: {
			tags: ["Personal Access Tokens"],
			summary: "Revoke a personal access token",
			params: {
				type: "object" as const,
				properties: { tokenId: { type: "string" as const } },
				required: ["tokenId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								id: { type: "string" as const },
								revoked_at: {
									type: "string" as const,
									format: "date-time",
								},
							},
						},
					},
				},
				403: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const userId = userPrincipal(request).userId;
			const { tokenId } = request.params as { tokenId: string };
			const revokedAt = new Date().toISOString();

			let revoked: { id: string }[];
			try {
				revoked = await db
					.update(personalAccessTokens)
					.set({ revoked_at: revokedAt })
					.where(
						and(
							eq(personalAccessTokens.id, tokenId),
							eq(personalAccessTokens.user_id, userId),
							isNull(personalAccessTokens.revoked_at),
						),
					)
					.returning({ id: personalAccessTokens.id });
			} catch {
				return reply.code(500).send({ message: "Failed to revoke token" });
			}
			if (revoked.length === 0) {
				return reply.code(404).send({ message: "Token not found" });
			}

			return reply.send({ data: { id: tokenId, revoked_at: revokedAt } });
		},
	});
}
