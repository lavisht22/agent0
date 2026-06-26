import { createHash } from "node:crypto";
import { invitations, users, workspaces, workspaceUser } from "@repo/database";
import { and, eq, gt, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { sendWorkspaceInvite } from "../lib/auth/email.js";
import { userPrincipal } from "../lib/auth.js";
import { db } from "../lib/pg.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

// 7 days, matching the wording in the invite email.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

// Emails on `users` aren't guaranteed lower-cased, so match case-insensitively.
function emailEquals(column: typeof users.email, normalized: string) {
	return eq(sql`lower(${column})`, normalized);
}

const PendingInvitationSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		email: { type: "string" as const },
		role: {
			type: "string" as const,
			enum: ["admin", "writer", "reader"],
		},
		invited_by_name: { type: "string" as const, nullable: true },
		expires_at: { type: "string" as const, format: "date-time" },
		created_at: { type: "string" as const, format: "date-time" },
	},
};

export async function registerInvitationsRoutes(fastify: FastifyInstance) {
	// Admin-only: inviting members is workspace management. The `:workspaceId`
	// path param drives scope resolution, so `workspaces:write:*` == admin/owner.
	fastify.post("/api/v1/workspaces/:workspaceId/invitations", {
		preHandler: [requireScope("workspaces:write:*"), requireUserId],
		schema: {
			tags: ["Workspaces"],
			summary: "Invite a member to a workspace",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
			},
			body: {
				type: "object" as const,
				properties: {
					email: { type: "string" as const, format: "email", minLength: 3 },
					role: {
						type: "string" as const,
						enum: ["admin", "writer", "reader"],
					},
				},
				required: ["email", "role"],
				additionalProperties: false,
			},
			response: {
				// `outcome` tells the client whether the person was added straight away
				// (existing user) or emailed an invitation (new user).
				201: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								outcome: {
									type: "string" as const,
									enum: ["member_added", "invitation_sent"],
								},
								email: { type: "string" as const },
							},
						},
					},
				},
				400: ErrorSchema,
				403: ErrorSchema,
				404: ErrorSchema,
				409: ErrorSchema,
				500: ErrorSchema,
				502: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const callerId = userPrincipal(request).userId;
			const { workspaceId } = request.params as { workspaceId: string };
			const { email, role } = request.body as {
				email: string;
				role: "admin" | "writer" | "reader";
			};

			const normalizedEmail = normalizeEmail(email);
			if (normalizedEmail.length === 0) {
				return reply.code(400).send({ message: "email must not be empty" });
			}

			// Existing user → add to the workspace immediately, no email round-trip.
			let existingUser: { id: string } | undefined;
			try {
				[existingUser] = await db
					.select({ id: users.id })
					.from(users)
					.where(emailEquals(users.email, normalizedEmail))
					.limit(1);
			} catch {
				return reply.code(500).send({ message: "Failed to invite member" });
			}

			if (existingUser) {
				const [membership] = await db
					.select({ user_id: workspaceUser.user_id })
					.from(workspaceUser)
					.where(
						and(
							eq(workspaceUser.user_id, existingUser.id),
							eq(workspaceUser.workspace_id, workspaceId),
						),
					)
					.limit(1);

				if (membership) {
					return reply
						.code(409)
						.send({ message: "This user is already a member" });
				}

				try {
					await db.insert(workspaceUser).values({
						user_id: existingUser.id,
						workspace_id: workspaceId,
						role,
					});
				} catch {
					return reply.code(500).send({ message: "Failed to add member" });
				}

				return reply.code(201).send({
					data: { outcome: "member_added", email: normalizedEmail },
				});
			}

			// New user → create (or refresh) a pending invitation and email a link.
			const [workspace] = await db
				.select({ name: workspaces.name })
				.from(workspaces)
				.where(eq(workspaces.id, workspaceId))
				.limit(1);

			if (!workspace) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			const rawToken = nanoid(32);
			const tokenHash = sha256Hex(rawToken);
			const now = new Date();
			const expiresAt = new Date(now.getTime() + INVITE_TTL_MS).toISOString();

			let inserted: { id: string } | undefined;
			try {
				// Supersede any earlier pending invite for the same email so a person
				// only ever has one live link per workspace.
				await db
					.update(invitations)
					.set({ status: "revoked", updated_at: now.toISOString() })
					.where(
						and(
							eq(invitations.workspace_id, workspaceId),
							eq(invitations.email, normalizedEmail),
							eq(invitations.status, "pending"),
						),
					);

				[inserted] = await db
					.insert(invitations)
					.values({
						id: nanoid(),
						workspace_id: workspaceId,
						email: normalizedEmail,
						role,
						token_hash: tokenHash,
						status: "pending",
						invited_by: callerId,
						expires_at: expiresAt,
					})
					.returning({ id: invitations.id });
			} catch {
				return reply.code(500).send({ message: "Failed to create invitation" });
			}

			const [inviter] = await db
				.select({ name: users.name })
				.from(users)
				.where(eq(users.id, callerId))
				.limit(1);

			const appUrl = process.env.APP_URL ?? "";
			const acceptUrl = `${appUrl.replace(/\/$/, "")}/invite/${rawToken}`;

			try {
				await sendWorkspaceInvite({
					email: normalizedEmail,
					acceptUrl,
					workspaceName: workspace.name,
					inviterName: inviter?.name ?? null,
				});
			} catch {
				// Don't leave a live invite the admin thinks went out — roll it back.
				if (inserted) {
					await db
						.delete(invitations)
						.where(eq(invitations.id, inserted.id))
						.catch(() => {});
				}
				return reply
					.code(502)
					.send({ message: "Failed to send invitation email" });
			}

			return reply.code(201).send({
				data: { outcome: "invitation_sent", email: normalizedEmail },
			});
		},
	});

	// Pending invitations are part of the member roster admins manage.
	fastify.get("/api/v1/workspaces/:workspaceId/invitations", {
		preHandler: [requireScope("workspaces:write:*"), requireUserId],
		schema: {
			tags: ["Workspaces"],
			summary: "List pending invitations for a workspace",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "array" as const,
							items: PendingInvitationSchema,
						},
					},
				},
				403: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			try {
				const rows = await db
					.select({
						id: invitations.id,
						email: invitations.email,
						role: invitations.role,
						invited_by_name: users.name,
						expires_at: invitations.expires_at,
						created_at: invitations.created_at,
					})
					.from(invitations)
					.leftJoin(users, eq(invitations.invited_by, users.id))
					.where(
						and(
							eq(invitations.workspace_id, workspaceId),
							eq(invitations.status, "pending"),
							gt(invitations.expires_at, new Date().toISOString()),
						),
					)
					.orderBy(invitations.created_at);

				return reply.send({
					data: rows.map((row) => ({
						...row,
						created_at: new Date(row.created_at).toISOString(),
						expires_at: new Date(row.expires_at).toISOString(),
					})),
				});
			} catch {
				return reply.code(500).send({ message: "Failed to list invitations" });
			}
		},
	});

	// Revoke a pending invitation (kills the emailed link).
	fastify.delete("/api/v1/workspaces/:workspaceId/invitations/:invitationId", {
		preHandler: [requireScope("workspaces:write:*"), requireUserId],
		schema: {
			tags: ["Workspaces"],
			summary: "Revoke a pending invitation",
			params: {
				type: "object" as const,
				properties: {
					workspaceId: { type: "string" as const },
					invitationId: { type: "string" as const },
				},
				required: ["workspaceId", "invitationId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: { success: { type: "boolean" as const } },
				},
				403: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, invitationId } = request.params as {
				workspaceId: string;
				invitationId: string;
			};

			let updated: { id: string }[];
			try {
				updated = await db
					.update(invitations)
					.set({ status: "revoked", updated_at: new Date().toISOString() })
					.where(
						and(
							eq(invitations.id, invitationId),
							eq(invitations.workspace_id, workspaceId),
							eq(invitations.status, "pending"),
						),
					)
					.returning({ id: invitations.id });
			} catch {
				return reply.code(500).send({ message: "Failed to revoke invitation" });
			}
			if (updated.length === 0) {
				return reply
					.code(404)
					.send({ message: "Pending invitation not found" });
			}

			return reply.send({ success: true });
		},
	});

	// Token-scoped, not workspace-scoped: the holder may not be a member yet, so
	// these resolve the invite by its token and check the session user's email.
	// `requireUserId` forces a signed-in human (the accept link routes through
	// login first).
	fastify.get("/api/v1/invitations/:token", {
		preHandler: requireUserId,
		schema: {
			tags: ["Workspaces"],
			summary: "Look up an invitation by token (for the accept screen)",
			params: {
				type: "object" as const,
				properties: { token: { type: "string" as const } },
				required: ["token"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								workspace_id: { type: "string" as const },
								workspace_name: { type: "string" as const },
								email: { type: "string" as const },
								role: {
									type: "string" as const,
									enum: ["admin", "writer", "reader"],
								},
								status: {
									type: "string" as const,
									enum: ["pending", "accepted", "revoked", "expired"],
								},
								email_matches: { type: "boolean" as const },
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
			const { token } = request.params as { token: string };

			let invitation:
				| {
						workspace_id: string;
						workspace_name: string;
						email: string;
						role: "admin" | "writer" | "reader";
						status: "pending" | "accepted" | "revoked";
						expires_at: string;
				  }
				| undefined;
			try {
				[invitation] = await db
					.select({
						workspace_id: invitations.workspace_id,
						workspace_name: workspaces.name,
						email: invitations.email,
						role: invitations.role,
						status: invitations.status,
						expires_at: invitations.expires_at,
					})
					.from(invitations)
					.innerJoin(workspaces, eq(invitations.workspace_id, workspaces.id))
					.where(eq(invitations.token_hash, sha256Hex(token)))
					.limit(1);
			} catch {
				return reply.code(500).send({ message: "Failed to load invitation" });
			}

			if (!invitation) {
				return reply.code(404).send({ message: "Invitation not found" });
			}

			const [user] = await db
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			const expired =
				invitation.status === "pending" &&
				new Date(invitation.expires_at).getTime() <= Date.now();

			return reply.send({
				data: {
					workspace_id: invitation.workspace_id,
					workspace_name: invitation.workspace_name,
					email: invitation.email,
					role: invitation.role,
					status: expired ? "expired" : invitation.status,
					email_matches:
						!!user && normalizeEmail(user.email) === invitation.email,
				},
			});
		},
	});

	// Exchange a valid token for membership. Idempotent for the rightful invitee:
	// re-accepting an already-accepted invite they hold just returns the workspace.
	fastify.post("/api/v1/invitations/:token/accept", {
		preHandler: requireUserId,
		schema: {
			tags: ["Workspaces"],
			summary: "Accept an invitation",
			params: {
				type: "object" as const,
				properties: { token: { type: "string" as const } },
				required: ["token"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								workspace_id: { type: "string" as const },
							},
						},
					},
				},
				403: ErrorSchema,
				404: ErrorSchema,
				409: ErrorSchema,
				410: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const userId = userPrincipal(request).userId;
			const { token } = request.params as { token: string };

			let invitation:
				| {
						id: string;
						workspace_id: string;
						email: string;
						role: "admin" | "writer" | "reader";
						status: "pending" | "accepted" | "revoked";
						expires_at: string;
				  }
				| undefined;
			try {
				[invitation] = await db
					.select({
						id: invitations.id,
						workspace_id: invitations.workspace_id,
						email: invitations.email,
						role: invitations.role,
						status: invitations.status,
						expires_at: invitations.expires_at,
					})
					.from(invitations)
					.where(eq(invitations.token_hash, sha256Hex(token)))
					.limit(1);
			} catch {
				return reply.code(500).send({ message: "Failed to accept invitation" });
			}

			if (!invitation) {
				return reply.code(404).send({ message: "Invitation not found" });
			}

			const [user] = await db
				.select({ email: users.email })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			// The invite is bound to an email; only the matching signed-in user can
			// redeem it (stops a leaked link being used by someone else).
			if (!user || normalizeEmail(user.email) !== invitation.email) {
				return reply.code(403).send({
					message: `This invitation was sent to ${invitation.email}. Sign in with that email to accept.`,
				});
			}

			if (invitation.status === "revoked") {
				return reply
					.code(403)
					.send({ message: "This invitation has been revoked" });
			}

			const alreadyMember = await db
				.select({ user_id: workspaceUser.user_id })
				.from(workspaceUser)
				.where(
					and(
						eq(workspaceUser.user_id, userId),
						eq(workspaceUser.workspace_id, invitation.workspace_id),
					),
				)
				.limit(1);

			if (invitation.status === "accepted") {
				// Already redeemed. Friendly to the rightful holder who revisits the
				// link; a no-op otherwise.
				if (alreadyMember.length > 0) {
					return reply.send({
						data: { workspace_id: invitation.workspace_id },
					});
				}
				return reply
					.code(409)
					.send({ message: "This invitation has already been used" });
			}

			if (new Date(invitation.expires_at).getTime() <= Date.now()) {
				return reply.code(410).send({ message: "This invitation has expired" });
			}

			try {
				if (alreadyMember.length === 0) {
					await db.insert(workspaceUser).values({
						user_id: userId,
						workspace_id: invitation.workspace_id,
						role: invitation.role,
					});
				}

				await db
					.update(invitations)
					.set({
						status: "accepted",
						accepted_at: new Date().toISOString(),
						updated_at: new Date().toISOString(),
					})
					.where(eq(invitations.id, invitation.id));
			} catch {
				return reply.code(500).send({ message: "Failed to accept invitation" });
			}

			return reply.send({ data: { workspace_id: invitation.workspace_id } });
		},
	});
}
