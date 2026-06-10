import { users, workspaces, workspaceUser } from "@repo/database";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { userPrincipal } from "../lib/auth.js";
import { db } from "../lib/pg.js";
import { hasScope, requireScope, requireUserId } from "../lib/scopes.js";

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

const workspaceColumns = {
	id: workspaces.id,
	name: workspaces.name,
	user_id: workspaces.user_id,
	created_at: workspaces.created_at,
	updated_at: workspaces.updated_at,
};

function toWorkspace(row: {
	id: string;
	name: string;
	user_id: string;
	created_at: string;
	updated_at: string;
}) {
	return {
		...row,
		created_at: new Date(row.created_at).toISOString(),
		updated_at: new Date(row.updated_at).toISOString(),
	};
}

function toMember(row: {
	user_id: string;
	role: "admin" | "writer" | "reader";
	created_at: string;
	updated_at: string;
	user: { id: string; name: string | null } | null;
}) {
	return {
		...row,
		created_at: new Date(row.created_at).toISOString(),
		updated_at: new Date(row.updated_at).toISOString(),
	};
}

const WorkspaceSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		user_id: { type: "string" as const },
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
	},
};

const MemberSchema = {
	type: "object" as const,
	properties: {
		user_id: { type: "string" as const },
		role: {
			type: "string" as const,
			enum: ["admin", "writer", "reader"],
		},
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
		user: {
			type: "object" as const,
			nullable: true,
			properties: {
				id: { type: "string" as const },
				name: { type: "string" as const, nullable: true },
			},
		},
	},
};

// Admin ⟺ the resolved scopes include `*:*:*` (only admins get it).
function isAdmin(request: FastifyRequest): boolean {
	return hasScope(request.principal?.scopes ?? [], "workspaces:write:*");
}

// Workspace management is allowed for admins OR the workspace owner. The owner
// check is an escape hatch so the creator can never lock themselves out (e.g.
// after being demoted). Only consulted when the caller isn't already an admin.
async function isOwner(workspaceId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ user_id: workspaces.user_id })
		.from(workspaces)
		.where(eq(workspaces.id, workspaceId))
		.limit(1);
	return !!row && row.user_id === userId;
}

async function requireAdminOrOwner(
	request: FastifyRequest,
	reply: FastifyReply,
	workspaceId: string,
	userId: string,
): Promise<boolean> {
	if (isAdmin(request)) return true;
	if (await isOwner(workspaceId, userId)) return true;
	reply.code(403).send({ message: "Admin or workspace owner required" });
	return false;
}

export async function registerWorkspacesRoute(fastify: FastifyInstance) {
	// PAT-only — API keys are workspace-pinned and can't enumerate others.
	fastify.get("/api/v1/workspaces", {
		preHandler: requireUserId,
		schema: {
			tags: ["Discovery"],
			summary: "List workspaces the calling user belongs to",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "array" as const,
							items: {
								type: "object" as const,
								properties: {
									id: { type: "string" as const },
									name: { type: "string" as const },
									role: {
										type: "string" as const,
										enum: ["admin", "writer", "reader"],
									},
									created_at: {
										type: "string" as const,
										format: "date-time",
									},
								},
							},
						},
					},
				},
				403: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const userId = userPrincipal(request).userId;

			try {
				const rows = await db
					.select({
						id: workspaces.id,
						name: workspaces.name,
						role: workspaceUser.role,
						created_at: workspaces.created_at,
					})
					.from(workspaceUser)
					.innerJoin(workspaces, eq(workspaceUser.workspace_id, workspaces.id))
					.where(eq(workspaceUser.user_id, userId))
					.orderBy(asc(workspaces.created_at));

				return reply.send({
					data: rows.map((row) => ({
						...row,
						created_at: new Date(row.created_at).toISOString(),
					})),
				});
			} catch {
				return reply.code(500).send({ message: "Failed to list workspaces" });
			}
		},
	});

	// The `workspace_assign_owner_admin` trigger seeds the creator's admin
	// membership, so we only insert the workspace row (owner = caller).
	fastify.post("/api/v1/workspaces", {
		preHandler: requireUserId,
		schema: {
			tags: ["Workspaces"],
			summary: "Create a workspace",
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
					properties: { data: WorkspaceSchema },
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

			try {
				const [data] = await db
					.insert(workspaces)
					.values({ id: nanoid(), name: trimmedName, user_id: userId })
					.returning(workspaceColumns);

				if (!data) {
					return reply
						.code(500)
						.send({ message: "Failed to create workspace" });
				}

				return reply.code(201).send({ data: toWorkspace(data) });
			} catch {
				return reply.code(500).send({ message: "Failed to create workspace" });
			}
		},
	});

	fastify.patch("/api/v1/workspaces/:workspaceId", {
		preHandler: requireUserId,
		schema: {
			tags: ["Workspaces"],
			summary: "Update a workspace",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
			},
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
				},
				additionalProperties: false,
			},
			response: {
				200: {
					type: "object" as const,
					properties: { data: WorkspaceSchema },
				},
				400: ErrorSchema,
				403: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const userId = userPrincipal(request).userId;
			const { workspaceId } = request.params as { workspaceId: string };
			const body = request.body as { name?: string };

			if (!(await requireAdminOrOwner(request, reply, workspaceId, userId))) {
				return;
			}

			if (body.name === undefined) {
				return reply.code(400).send({ message: "No updates provided" });
			}
			const trimmedName = body.name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			let data:
				| {
						id: string;
						name: string;
						user_id: string;
						created_at: string;
						updated_at: string;
				  }
				| undefined;
			try {
				[data] = await db
					.update(workspaces)
					.set({ name: trimmedName, updated_at: new Date().toISOString() })
					.where(eq(workspaces.id, workspaceId))
					.returning(workspaceColumns);
			} catch {
				return reply.code(500).send({ message: "Failed to update workspace" });
			}
			if (!data) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			return reply.send({ data: toWorkspace(data) });
		},
	});

	// Cascades to workspace data via FKs.
	fastify.delete("/api/v1/workspaces/:workspaceId", {
		preHandler: requireUserId,
		schema: {
			tags: ["Workspaces"],
			summary: "Delete a workspace",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
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
			const userId = userPrincipal(request).userId;
			const { workspaceId } = request.params as { workspaceId: string };

			if (!(await requireAdminOrOwner(request, reply, workspaceId, userId))) {
				return;
			}

			let deleted: { id: string }[];
			try {
				deleted = await db
					.delete(workspaces)
					.where(eq(workspaces.id, workspaceId))
					.returning({ id: workspaces.id });
			} catch {
				return reply.code(500).send({ message: "Failed to delete workspace" });
			}
			if (deleted.length === 0) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			return reply.send({ success: true });
		},
	});

	// `members:read:*` is held by every role; `requireUserId` keeps member PII
	// (names) out of reach of machine API keys.
	fastify.get("/api/v1/workspaces/:workspaceId/members", {
		preHandler: [requireScope("members:read:*"), requireUserId],
		schema: {
			tags: ["Workspaces"],
			summary: "List members of a workspace",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: MemberSchema },
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
						user_id: workspaceUser.user_id,
						role: workspaceUser.role,
						created_at: workspaceUser.created_at,
						updated_at: workspaceUser.updated_at,
						user: { id: users.id, name: users.name },
					})
					.from(workspaceUser)
					.leftJoin(users, eq(workspaceUser.user_id, users.id))
					.where(eq(workspaceUser.workspace_id, workspaceId))
					.orderBy(asc(workspaceUser.created_at));

				return reply.send({ data: rows.map(toMember) });
			} catch {
				return reply.code(500).send({ message: "Failed to list members" });
			}
		},
	});

	// Admin only: self-service role changes would be a privilege-escalation path.
	fastify.patch("/api/v1/workspaces/:workspaceId/members/:userId", {
		preHandler: [requireScope("workspaces:write:*"), requireUserId],
		schema: {
			tags: ["Workspaces"],
			summary: "Update a member's role",
			params: {
				type: "object" as const,
				properties: {
					workspaceId: { type: "string" as const },
					userId: { type: "string" as const },
				},
				required: ["workspaceId", "userId"],
			},
			body: {
				type: "object" as const,
				properties: {
					role: {
						type: "string" as const,
						enum: ["admin", "writer", "reader"],
					},
				},
				required: ["role"],
				additionalProperties: false,
			},
			response: {
				200: {
					type: "object" as const,
					properties: { data: MemberSchema },
				},
				403: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, userId } = request.params as {
				workspaceId: string;
				userId: string;
			};
			const { role } = request.body as {
				role: "admin" | "writer" | "reader";
			};

			let updated:
				| {
						user_id: string;
						role: "admin" | "writer" | "reader";
						created_at: string;
						updated_at: string;
				  }
				| undefined;
			try {
				[updated] = await db
					.update(workspaceUser)
					.set({ role, updated_at: new Date().toISOString() })
					.where(
						and(
							eq(workspaceUser.workspace_id, workspaceId),
							eq(workspaceUser.user_id, userId),
						),
					)
					.returning({
						user_id: workspaceUser.user_id,
						role: workspaceUser.role,
						created_at: workspaceUser.created_at,
						updated_at: workspaceUser.updated_at,
					});
			} catch {
				return reply.code(500).send({ message: "Failed to update member" });
			}
			if (!updated) {
				return reply.code(404).send({ message: "Member not found" });
			}

			const [user] = await db
				.select({ id: users.id, name: users.name })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			return reply.send({ data: toMember({ ...updated, user: user ?? null }) });
		},
	});

	fastify.delete("/api/v1/workspaces/:workspaceId/members/:userId", {
		preHandler: requireUserId,
		schema: {
			tags: ["Workspaces"],
			summary: "Remove a member from a workspace",
			params: {
				type: "object" as const,
				properties: {
					workspaceId: { type: "string" as const },
					userId: { type: "string" as const },
				},
				required: ["workspaceId", "userId"],
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
			const callerId = userPrincipal(request).userId;
			const { workspaceId, userId } = request.params as {
				workspaceId: string;
				userId: string;
			};

			// Admin can remove anyone; anyone can remove themselves (leave).
			if (!isAdmin(request) && userId !== callerId) {
				return reply
					.code(403)
					.send({ message: "Admin required to remove other members" });
			}

			let deleted: { user_id: string }[];
			try {
				deleted = await db
					.delete(workspaceUser)
					.where(
						and(
							eq(workspaceUser.workspace_id, workspaceId),
							eq(workspaceUser.user_id, userId),
						),
					)
					.returning({ user_id: workspaceUser.user_id });
			} catch {
				return reply.code(500).send({ message: "Failed to remove member" });
			}
			if (deleted.length === 0) {
				return reply.code(404).send({ message: "Member not found" });
			}

			return reply.send({ success: true });
		},
	});
}
