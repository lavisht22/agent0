import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

const TagSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		color: { type: "string" as const },
		workspace_id: { type: "string" as const },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerTagsRoutes(fastify: FastifyInstance) {
	fastify.get("/tags", {
		preHandler: requireScope("tags:read:*"),
		schema: {
			tags: ["Tags"],
			summary: "List tags",
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: TagSchema },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			const { data, error } = await supabase
				.from("tags")
				.select("id, name, color, workspace_id")
				.eq("workspace_id", workspaceId)
				.order("name", { ascending: true });

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch tags" });
			}

			return reply.send({ data });
		},
	});

	fastify.post("/tags", {
		preHandler: requireUserId,
		schema: {
			tags: ["Tags"],
			summary: "Create a tag",
			body: {
				type: "object" as const,
				properties: {
					name: { type: "string" as const, minLength: 1 },
					color: { type: "string" as const, minLength: 1 },
				},
				required: ["name", "color"],
				additionalProperties: false,
			},
			response: {
				201: {
					type: "object" as const,
					properties: {
						data: TagSchema,
					},
				},
				400: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const { name, color } = request.body as { name: string; color: string };

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const trimmedColor = color.trim();
			if (trimmedColor.length === 0) {
				return reply.code(400).send({ message: "color must not be empty" });
			}

			const { data, error } = await supabase
				.from("tags")
				.insert({
					id: nanoid(),
					workspace_id: workspaceId,
					name: trimmedName,
					color: trimmedColor,
				})
				.select("id, name, color, workspace_id")
				.single();

			if (error || !data) {
				return reply.code(500).send({ message: "Failed to create tag" });
			}

			return reply.code(201).send({ data });
		},
	});

	fastify.delete("/tags/:id", {
		preHandler: requireUserId,
		schema: {
			tags: ["Tags"],
			summary: "Delete a tag",
			params: {
				type: "object" as const,
				properties: {
					id: { type: "string" as const },
				},
				required: ["id"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						success: { type: "boolean" as const },
					},
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
				.from("tags")
				.delete({ count: "exact" })
				.eq("id", id)
				.eq("workspace_id", workspaceId);

			if (error) {
				return reply.code(500).send({ message: "Failed to delete tag" });
			}

			if (count === 0) {
				return reply.code(404).send({ message: "Tag not found" });
			}

			return reply.send({ success: true });
		},
	});
}
