import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { customAlphabet, nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { requireUserId } from "../lib/scopes.js";

// PATs are user-bound, NOT workspace-bound — there is no workspace scope to
// check. The Supabase RLS gated every operation on `user_id = auth.uid()`, i.e.
// "a user manages only their own tokens." The runner connects as the service
// role and bypasses RLS, so we MUST re-implement that ownership check in code:
// every query filters on `.eq("user_id", request.userId)`. `requireUserId`
// keeps machine api-keys out (they have no user identity); it admits both
// browser sessions and PATs, which matches the dashboard/CLI callers.

// Must match the prefix the auth middleware uses to route a bearer token to the
// PAT authenticator (apps/runner/src/lib/auth.ts), so a minted token actually
// authenticates as a PAT.
const TOKEN_PREFIX = "agent0_pat_";
// Static prefix + 4 random chars — enough to tell tokens apart in the list
// without ever storing the secret (parity with the web's PREFIX_DISPLAY_LEN).
const PREFIX_DISPLAY_LEN = TOKEN_PREFIX.length + 4;

// URL-/shell-safe alphabet (no +, /, =), 32 chars — identical to the web's
// former client-side generation. Minted server-side now so the raw secret is
// never supplied by an untrusted caller.
const tokenRandom = customAlphabet(
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
	32,
);

function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

// Never expose token_hash. The raw token is only ever returned once, from the
// create handler.
const SELECT_COLUMNS =
	"id, name, token_prefix, created_at, last_used_at, expires_at, revoked_at";

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
	// List the caller's own active (non-revoked) tokens.
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
			const userId = request.userId as string;

			const { data, error } = await supabase
				.from("personal_access_tokens")
				.select(SELECT_COLUMNS)
				.eq("user_id", userId)
				.is("revoked_at", null)
				.order("created_at", { ascending: false });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch tokens" });
			}

			return reply.send({ data });
		},
	});

	// Mint a new token for the caller. The raw secret is returned exactly once.
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
							// The minted token's metadata plus the raw secret, shown once.
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
			const userId = request.userId as string;
			const { name } = request.body as { name: string };

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const token = `${TOKEN_PREFIX}${tokenRandom()}`;

			const { data, error } = await supabase
				.from("personal_access_tokens")
				.insert({
					id: nanoid(),
					user_id: userId,
					token_hash: sha256Hex(token),
					token_prefix: token.slice(0, PREFIX_DISPLAY_LEN),
					name: trimmedName,
				})
				.select(SELECT_COLUMNS)
				.single();

			if (error || !data) {
				return reply.code(500).send({ message: "Failed to create token" });
			}

			return reply.code(201).send({ data: { ...data, token } });
		},
	});

	// Revoke one of the caller's tokens. Soft delete (sets revoked_at) so audit
	// history and last_used_at survive — same as /auth/logout. The
	// `user_id` filter is the authorization: a user can only revoke their own.
	fastify.delete("/api/v1/personal-access-tokens/:id", {
		preHandler: requireUserId,
		schema: {
			tags: ["Personal Access Tokens"],
			summary: "Revoke a personal access token",
			params: {
				type: "object" as const,
				properties: { id: { type: "string" as const } },
				required: ["id"],
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
			const userId = request.userId as string;
			const { id } = request.params as { id: string };
			const revokedAt = new Date().toISOString();

			const { data, error } = await supabase
				.from("personal_access_tokens")
				.update({ revoked_at: revokedAt })
				.eq("id", id)
				.eq("user_id", userId)
				.is("revoked_at", null)
				.select("id")
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to revoke token" });
			}
			if (!data) {
				return reply.code(404).send({ message: "Token not found" });
			}

			return reply.send({ data: { id, revoked_at: revokedAt } });
		},
	});
}
