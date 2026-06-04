import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { hasScope, requireScope, requireUserId } from "../lib/scopes.js";

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

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
	return hasScope(request.scopes, "workspaces:write:*");
}

// Workspace management is allowed for admins OR the workspace owner. The owner
// check is an escape hatch so the creator can never lock themselves out (e.g.
// after being demoted). Only consulted when the caller isn't already an admin.
async function isOwner(workspaceId: string, userId: string): Promise<boolean> {
	const { data } = await supabase
		.from("workspaces")
		.select("user_id")
		.eq("id", workspaceId)
		.maybeSingle();
	return !!data && data.user_id === userId;
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
	// Lists every workspace the calling user is a member of. PAT-only —
	// API keys are workspace-pinned and have no business enumerating others.
	// Powers `agent0 login`'s workspace-picker prompt and `agent0 workspaces list`.
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
			// requireUserId guarantees this is set when authed via PAT.
			const userId = request.userId as string;

			const { data, error } = await supabase
				.from("workspace_user")
				.select("role, workspaces!inner(id, name, created_at)")
				.eq("user_id", userId)
				.order("created_at", { referencedTable: "workspaces" });

			if (error) {
				return reply.code(500).send({ message: "Failed to list workspaces" });
			}

			return reply.send({
				data: data.map((row) => ({
					id: row.workspaces.id,
					name: row.workspaces.name,
					role: row.role,
					created_at: row.workspaces.created_at,
				})),
			});
		},
	});

	// Create a workspace. Any authenticated user may create one. The
	// `workspace_assign_owner_admin` trigger seeds the creator's admin membership
	// in `workspace_user`, so we only insert the workspace row, setting `user_id`
	// to the caller as the owner.
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
			const userId = request.userId as string;
			const { name } = request.body as { name: string };

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const { data, error } = await supabase
				.from("workspaces")
				.insert({ id: nanoid(), name: trimmedName, user_id: userId })
				.select("id, name, user_id, created_at, updated_at")
				.single();

			if (error || !data) {
				return reply.code(500).send({ message: "Failed to create workspace" });
			}

			return reply.code(201).send({ data });
		},
	});

	// Rename a workspace. Admin or owner only.
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
			const userId = request.userId as string;
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

			const { data, error } = await supabase
				.from("workspaces")
				.update({ name: trimmedName, updated_at: new Date().toISOString() })
				.eq("id", workspaceId)
				.select("id, name, user_id, created_at, updated_at")
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to update workspace" });
			}
			if (!data) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			return reply.send({ data });
		},
	});

	// Delete a workspace (cascades to its data via FKs). Admin or owner only.
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
			const userId = request.userId as string;
			const { workspaceId } = request.params as { workspaceId: string };

			if (!(await requireAdminOrOwner(request, reply, workspaceId, userId))) {
				return;
			}

			const { error, count } = await supabase
				.from("workspaces")
				.delete({ count: "exact" })
				.eq("id", workspaceId);

			if (error) {
				return reply.code(500).send({ message: "Failed to delete workspace" });
			}
			if (count === 0) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			return reply.send({ success: true });
		},
	});

	// List members of a workspace. Any member can see the roster, so this reads at
	// `members:read:*` (held by every role). `requireUserId` keeps member PII
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

			const { data, error } = await supabase
				.from("workspace_user")
				.select("user_id, role, created_at, updated_at, users(id, name)")
				.eq("workspace_id", workspaceId)
				.order("created_at", { ascending: true });

			if (error) {
				return reply.code(500).send({ message: "Failed to list members" });
			}

			return reply.send({
				data: data.map((row) => {
					const { users, ...rest } = row;
					return { ...rest, user: users };
				}),
			});
		},
	});

	// Change a member's role. Admin only: letting a member change their own role
	// would be a privilege-escalation path (a reader could promote themselves to
	// admin).
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

			const { data, error } = await supabase
				.from("workspace_user")
				.update({ role, updated_at: new Date().toISOString() })
				.eq("workspace_id", workspaceId)
				.eq("user_id", userId)
				.select("user_id, role, created_at, updated_at, users(id, name)")
				.maybeSingle();

			if (error) {
				return reply.code(500).send({ message: "Failed to update member" });
			}
			if (!data) {
				return reply.code(404).send({ message: "Member not found" });
			}

			const { users, ...rest } = data;
			return reply.send({ data: { ...rest, user: users } });
		},
	});

	// Remove a member (or leave the workspace). An admin can remove anyone; any
	// member can remove themselves.
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
			const callerId = request.userId as string;
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

			const { error, count } = await supabase
				.from("workspace_user")
				.delete({ count: "exact" })
				.eq("workspace_id", workspaceId)
				.eq("user_id", userId);

			if (error) {
				return reply.code(500).send({ message: "Failed to remove member" });
			}
			if (count === 0) {
				return reply.code(404).send({ message: "Member not found" });
			}

			return reply.send({ success: true });
		},
	});
}
