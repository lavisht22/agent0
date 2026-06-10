import { personalAccessTokens, users } from "@repo/database";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { userPrincipal } from "../lib/auth.js";
import { db } from "../lib/pg.js";
import { requireUserId } from "../lib/scopes.js";

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerAuthRoutes(fastify: FastifyInstance) {
	// PAT-only — API keys have no user identity, so requireUserId 403s them.
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
			const principal = userPrincipal(request);
			const userId = principal.userId;
			const tokenId = principal.tokenId as string;

			// Email + name both live on public.users (better-auth owns the table).
			let user: { name: string | null; email: string } | undefined;
			try {
				[user] = await db
					.select({ name: users.name, email: users.email })
					.from(users)
					.where(eq(users.id, userId))
					.limit(1);
			} catch {
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

	// Soft delete (sets revoked_at) so audit history survives.
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
			const tokenId = userPrincipal(request).tokenId as string;
			const revokedAt = new Date().toISOString();

			try {
				await db
					.update(personalAccessTokens)
					.set({ revoked_at: revokedAt })
					.where(eq(personalAccessTokens.id, tokenId));
			} catch {
				return reply.code(500).send({ message: "Failed to revoke token" });
			}

			return reply.send({ data: { token_id: tokenId, revoked_at: revokedAt } });
		},
	});
}
