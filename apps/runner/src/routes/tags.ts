import { tags } from "@repo/database";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../lib/pg.js";
import { requireScope, requireUserId } from "../lib/scopes.js";

const tagColumns = {
	id: tags.id,
	name: tags.name,
	color: tags.color,
	workspace_id: tags.workspace_id,
};

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

			try {
				const data = await db
					.select(tagColumns)
					.from(tags)
					.where(eq(tags.workspace_id, workspaceId))
					.orderBy(asc(tags.name));

				return reply.send({ data });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch tags" });
			}
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

			try {
				const [data] = await db
					.insert(tags)
					.values({
						id: nanoid(),
						workspace_id: workspaceId,
						name: trimmedName,
						color: trimmedColor,
					})
					.returning(tagColumns);

				if (!data) {
					return reply.code(500).send({ message: "Failed to create tag" });
				}

				return reply.code(201).send({ data });
			} catch {
				return reply.code(500).send({ message: "Failed to create tag" });
			}
		},
	});

	fastify.delete("/tags/:tagId", {
		preHandler: requireUserId,
		schema: {
			tags: ["Tags"],
			summary: "Delete a tag",
			params: {
				type: "object" as const,
				properties: {
					tagId: { type: "string" as const },
				},
				required: ["tagId"],
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
			const { workspaceId, tagId } = request.params as {
				workspaceId: string;
				tagId: string;
			};

			try {
				const deleted = await db
					.delete(tags)
					.where(and(eq(tags.id, tagId), eq(tags.workspace_id, workspaceId)))
					.returning({ id: tags.id });

				if (deleted.length === 0) {
					return reply.code(404).send({ message: "Tag not found" });
				}

				return reply.send({ success: true });
			} catch {
				return reply.code(500).send({ message: "Failed to delete tag" });
			}
		},
	});
}
