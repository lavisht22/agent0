import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { requireUserId } from "../lib/scopes.js";

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

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
}
