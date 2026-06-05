import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { requireUserId } from "../lib/scopes.js";

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerAuthRoutes(fastify: FastifyInstance) {
	// Identity check for the calling PAT. Used by `agent0 whoami` and by
	// `agent0 login` to confirm a freshly pasted token works. PAT-only —
	// API keys have no user identity, so they get a 403 from requireUserId.
	fastify.get("/api/v1/me", {
		preHandler: requireUserId,
		schema: {
			tags: ["Auth"],
			summary: "Identity of the calling personal access token",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								user_id: { type: "string" as const },
								user_email: { type: "string" as const, nullable: true },
								user_name: { type: "string" as const, nullable: true },
								token_id: { type: "string" as const },
							},
						},
					},
				},
				403: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			// requireUserId guarantees both are set when authed via PAT.
			const userId = request.userId as string;
			const tokenId = request.tokenId as string;

			// Email + name both live on public.users now (Phase 2 extended the
			// table); no more Supabase Auth admin lookup.
			const { data: user, error } = await supabase
				.from("users")
				.select("name, email")
				.eq("id", userId)
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to resolve identity" });
			}

			return reply.send({
				data: {
					user_id: userId,
					user_email: user?.email ?? null,
					user_name: user?.name ?? null,
					token_id: tokenId,
				},
			});
		},
	});

	// Revoke the calling PAT. Soft delete (sets revoked_at) so audits and
	// last_used_at survive. Used by `agent0 logout`.
	fastify.post("/api/v1/auth/logout", {
		preHandler: requireUserId,
		schema: {
			tags: ["Auth"],
			summary: "Revoke the personal access token used for this request",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								token_id: { type: "string" as const },
								revoked_at: { type: "string" as const, format: "date-time" },
							},
						},
					},
				},
				403: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const tokenId = request.tokenId as string;
			const revokedAt = new Date().toISOString();

			const { error } = await supabase
				.from("personal_access_tokens")
				.update({ revoked_at: revokedAt })
				.eq("id", tokenId);

			if (error) {
				return reply.code(500).send({ message: "Failed to revoke token" });
			}

			return reply.send({ data: { token_id: tokenId, revoked_at: revokedAt } });
		},
	});
}
