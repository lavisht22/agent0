import { agents, agentTags, agentVersions, tags } from "@repo/database";
import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { userPrincipal } from "../lib/auth.js";
import { db } from "../lib/pg.js";
import { checkScope, requireScope, requireUserId } from "../lib/scopes.js";

const TagSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		color: { type: "string" as const },
	},
};

// A lightweight model reference derived from a deployed version's prompt data,
// so the agents list can show the model per row without shipping the full blob.
const ModelSummarySchema = {
	type: "object" as const,
	nullable: true,
	properties: {
		provider_id: { type: "string" as const },
		name: { type: "string" as const },
	},
};

const AgentSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
		staging_version_id: { type: "string" as const, nullable: true },
		production_version_id: { type: "string" as const, nullable: true },
		staging_model: ModelSummarySchema,
		production_model: ModelSummarySchema,
		tags: { type: "array" as const, items: TagSchema },
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
	},
};

// Pull `{ provider_id, name }` out of a version's opaque prompt data. Mirrors the
// web's `extractModel`, so the list's model column renders identically.
function extractModel(
	data: unknown,
): { provider_id: string; name: string } | null {
	if (!data || typeof data !== "object") return null;
	const model = (data as { model?: unknown }).model;
	if (!model || typeof model !== "object") return null;
	const { provider_id, name } = model as {
		provider_id?: unknown;
		name?: unknown;
	};
	if (typeof provider_id !== "string" || typeof name !== "string") return null;
	if (!provider_id || !name) return null;
	return { provider_id, name };
}

// Base agent columns shared by every read path. The model summaries and tags are
// hydrated separately (see `hydrateAgents`) since they live in joined tables.
const agentColumns = {
	id: agents.id,
	name: agents.name,
	staging_version_id: agents.staging_version_id,
	production_version_id: agents.production_version_id,
	created_at: agents.created_at,
	updated_at: agents.updated_at,
};

type AgentRow = {
	id: string;
	name: string;
	staging_version_id: string | null;
	production_version_id: string | null;
	created_at: string;
	updated_at: string;
};

type Tag = { id: string; name: string; color: string };

// Attach each agent's tags and deployed-version model summaries. Batches the two
// lookups across all rows (one tag query, one version query) to avoid N+1, then
// stitches the results back together in memory.
async function hydrateAgents(rows: AgentRow[]) {
	if (rows.length === 0) return [];

	const agentIds = rows.map((r) => r.id);
	const versionIds = Array.from(
		new Set(
			rows.flatMap((r) =>
				[r.staging_version_id, r.production_version_id].filter(
					(id): id is string => !!id,
				),
			),
		),
	);

	const tagRows = await db
		.select({
			agent_id: agentTags.agent_id,
			id: tags.id,
			name: tags.name,
			color: tags.color,
		})
		.from(agentTags)
		.innerJoin(tags, eq(agentTags.tag_id, tags.id))
		.where(inArray(agentTags.agent_id, agentIds));

	const versionRows = versionIds.length
		? await db
				.select({ id: agentVersions.id, data: agentVersions.data })
				.from(agentVersions)
				.where(inArray(agentVersions.id, versionIds))
		: [];

	const tagsByAgent = new Map<string, Tag[]>();
	for (const { agent_id, id, name, color } of tagRows) {
		const list = tagsByAgent.get(agent_id) ?? [];
		list.push({ id, name, color });
		tagsByAgent.set(agent_id, list);
	}
	const dataByVersion = new Map(versionRows.map((v) => [v.id, v.data]));

	const modelFor = (versionId: string | null) =>
		extractModel(versionId ? dataByVersion.get(versionId) : null);

	return rows.map((agent) => ({
		id: agent.id,
		name: agent.name,
		staging_version_id: agent.staging_version_id,
		production_version_id: agent.production_version_id,
		staging_model: modelFor(agent.staging_version_id),
		production_model: modelFor(agent.production_version_id),
		tags: tagsByAgent.get(agent.id) ?? [],
		created_at: new Date(agent.created_at).toISOString(),
		updated_at: new Date(agent.updated_at).toISOString(),
	}));
}

const VersionSummarySchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		agent_id: { type: "string" as const },
		is_deployed: { type: "boolean" as const },
		user_id: { type: "string" as const },
		created_at: { type: "string" as const, format: "date-time" },
	},
};

const VersionDetailSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		agent_id: { type: "string" as const },
		is_deployed: { type: "boolean" as const },
		user_id: { type: "string" as const },
		data: { type: "object" as const, additionalProperties: true },
		created_at: { type: "string" as const, format: "date-time" },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerAgentRoutes(fastify: FastifyInstance) {
	fastify.get("/agents/:agentId", {
		preHandler: async (request, reply) => {
			const { agentId } = request.params as { agentId: string };
			checkScope(request, reply, `agents:read:${agentId}`);
		},
		schema: {
			tags: ["Agents"],
			summary: "Get a single agent",
			params: {
				type: "object" as const,
				properties: {
					agentId: { type: "string" as const, description: "Agent ID" },
				},
				required: ["agentId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: AgentSchema,
					},
				},
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId } = request.params as {
				workspaceId: string;
				agentId: string;
			};

			try {
				const [agent] = await db
					.select(agentColumns)
					.from(agents)
					.where(
						and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
					)
					.limit(1);

				if (!agent) {
					return reply.code(404).send({ message: "Agent not found" });
				}

				const [hydrated] = await hydrateAgents([agent]);
				return reply.send({ data: hydrated });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch agent" });
			}
		},
	});

	fastify.get("/agents", {
		preHandler: requireScope("agents:read:*"),
		schema: {
			tags: ["Agents"],
			summary: "List agents",
			querystring: {
				type: "object" as const,
				properties: {
					search: {
						type: "string" as const,
						description: "Search agents by name",
					},
					tag_ids: {
						type: "string" as const,
						description:
							"Comma-separated tag IDs to filter by (agents must have ALL specified tags)",
					},
					page: {
						type: "string" as const,
						default: "1",
						description: "Page number",
					},
					limit: {
						type: "string" as const,
						default: "20",
						description: "Items per page (max 100)",
					},
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: AgentSchema },
						page: { type: "number" as const },
						limit: { type: "number" as const },
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			const {
				search,
				tag_ids,
				page = "1",
				limit = "20",
			} = request.query as {
				search?: string;
				tag_ids?: string;
				page?: string;
				limit?: string;
			};

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(
				100,
				Math.max(1, Number.parseInt(limit, 10) || 20),
			);
			const offset = (pageNum - 1) * limitNum;

			try {
				// If tag_ids provided, filter agents that have ALL specified tags
				let matchingAgentIds: string[] | null = null;

				if (tag_ids) {
					const tagIdList = tag_ids.split(",").filter(Boolean);

					if (tagIdList.length > 0) {
						const links = await db
							.select({ agent_id: agentTags.agent_id })
							.from(agentTags)
							.where(inArray(agentTags.tag_id, tagIdList));

						// Only include agents that have ALL selected tags
						const agentIdCounts = links.reduce(
							(acc, { agent_id }) => {
								acc[agent_id] = (acc[agent_id] || 0) + 1;
								return acc;
							},
							{} as Record<string, number>,
						);

						matchingAgentIds = Object.entries(agentIdCounts)
							.filter(([_, count]) => count >= tagIdList.length)
							.map(([id]) => id);

						if (matchingAgentIds.length === 0) {
							return reply.send({ data: [], page: pageNum, limit: limitNum });
						}
					}
				}

				const conditions = [eq(agents.workspace_id, workspaceId)];
				if (matchingAgentIds) {
					conditions.push(inArray(agents.id, matchingAgentIds));
				}
				if (search) {
					conditions.push(ilike(agents.name, `%${search}%`));
				}

				const rows = await db
					.select(agentColumns)
					.from(agents)
					.where(and(...conditions))
					.orderBy(desc(agents.created_at))
					.limit(limitNum)
					.offset(offset);

				const data = await hydrateAgents(rows);

				return reply.send({ data, page: pageNum, limit: limitNum });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch agents" });
			}
		},
	});

	fastify.post("/agents", {
		preHandler: [requireScope("agents:write:*"), requireUserId],
		schema: {
			tags: ["Agents"],
			summary: "Create an agent",
			body: {
				type: "object" as const,
				properties: {
					name: {
						type: "string" as const,
						minLength: 1,
						description: "Agent name",
					},
					tag_ids: {
						type: "array" as const,
						items: { type: "string" as const },
						description:
							"Optional tag IDs to attach. All must belong to the caller's workspace.",
					},
				},
				required: ["name"],
				additionalProperties: false,
			},
			response: {
				201: {
					type: "object" as const,
					properties: {
						data: AgentSchema,
					},
				},
				400: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const { name, tag_ids } = request.body as {
				name: string;
				tag_ids?: string[];
			};

			const trimmedName = name.trim();
			if (trimmedName.length === 0) {
				return reply.code(400).send({ message: "name must not be empty" });
			}

			const uniqueTagIds = tag_ids ? Array.from(new Set(tag_ids)) : [];

			try {
				if (uniqueTagIds.length > 0) {
					const workspaceTags = await db
						.select({ id: tags.id })
						.from(tags)
						.where(
							and(
								eq(tags.workspace_id, workspaceId),
								inArray(tags.id, uniqueTagIds),
							),
						);

					const foundIds = new Set(workspaceTags.map((t) => t.id));
					const unknown = uniqueTagIds.filter((id) => !foundIds.has(id));
					if (unknown.length > 0) {
						return reply.code(400).send({
							message: `Unknown tag_ids for this workspace: ${unknown.join(", ")}`,
						});
					}
				}

				const agentId = nanoid();
				const [created] = await db
					.insert(agents)
					.values({ id: agentId, name: trimmedName, workspace_id: workspaceId })
					.returning(agentColumns);

				if (!created) {
					return reply.code(500).send({ message: "Failed to create agent" });
				}

				if (uniqueTagIds.length > 0) {
					try {
						await db.insert(agentTags).values(
							uniqueTagIds.map((tagId) => ({
								agent_id: agentId,
								tag_id: tagId,
							})),
						);
					} catch {
						// Roll back the agent so the caller doesn't end up with a half-created record.
						await db.delete(agents).where(eq(agents.id, agentId));
						return reply.code(500).send({ message: "Failed to attach tags" });
					}
				}

				const [hydrated] = await hydrateAgents([created]);
				return reply.code(201).send({ data: hydrated });
			} catch {
				return reply.code(500).send({ message: "Failed to create agent" });
			}
		},
	});

	// List versions for an agent (excludes version data/content for lighter response)
	fastify.get("/agents/:agentId/versions", {
		preHandler: async (request, reply) => {
			const { agentId } = request.params as { agentId: string };
			checkScope(request, reply, `agents:read:${agentId}`);
		},
		schema: {
			tags: ["Versions"],
			summary: "List versions for an agent",
			params: {
				type: "object" as const,
				properties: {
					agentId: { type: "string" as const, description: "Agent ID" },
				},
				required: ["agentId"],
			},
			querystring: {
				type: "object" as const,
				properties: {
					page: {
						type: "string" as const,
						default: "1",
						description: "Page number",
					},
					limit: {
						type: "string" as const,
						default: "20",
						description: "Items per page (max 100)",
					},
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: VersionSummarySchema },
						page: { type: "number" as const },
						limit: { type: "number" as const },
					},
				},
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId } = request.params as {
				workspaceId: string;
				agentId: string;
			};

			const { page = "1", limit = "20" } = request.query as {
				page?: string;
				limit?: string;
			};

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(
				100,
				Math.max(1, Number.parseInt(limit, 10) || 20),
			);
			const offset = (pageNum - 1) * limitNum;

			try {
				// Verify agent belongs to workspace
				const [agent] = await db
					.select({ id: agents.id })
					.from(agents)
					.where(
						and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
					)
					.limit(1);

				if (!agent) {
					return reply.code(404).send({ message: "Agent not found" });
				}

				const versions = await db
					.select({
						id: agentVersions.id,
						agent_id: agentVersions.agent_id,
						is_deployed: agentVersions.is_deployed,
						user_id: agentVersions.user_id,
						created_at: agentVersions.created_at,
					})
					.from(agentVersions)
					.where(eq(agentVersions.agent_id, agentId))
					.orderBy(desc(agentVersions.created_at))
					.limit(limitNum)
					.offset(offset);

				const data = versions.map((v) => ({
					...v,
					created_at: new Date(v.created_at).toISOString(),
				}));

				return reply.send({ data, page: pageNum, limit: limitNum });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch versions" });
			}
		},
	});

	// Get a single version with full content
	fastify.get("/agents/:agentId/versions/:versionId", {
		preHandler: async (request, reply) => {
			const { agentId } = request.params as { agentId: string };
			checkScope(request, reply, `agents:read:${agentId}`);
		},
		schema: {
			tags: ["Versions"],
			summary: "Get a single version with full content",
			params: {
				type: "object" as const,
				properties: {
					agentId: { type: "string" as const, description: "Agent ID" },
					versionId: { type: "string" as const, description: "Version ID" },
				},
				required: ["agentId", "versionId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: VersionDetailSchema,
					},
				},
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId, versionId } = request.params as {
				workspaceId: string;
				agentId: string;
				versionId: string;
			};

			try {
				// Verify agent belongs to workspace
				const [agent] = await db
					.select({ id: agents.id })
					.from(agents)
					.where(
						and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
					)
					.limit(1);

				if (!agent) {
					return reply.code(404).send({ message: "Agent not found" });
				}

				const [version] = await db
					.select()
					.from(agentVersions)
					.where(
						and(
							eq(agentVersions.id, versionId),
							eq(agentVersions.agent_id, agentId),
						),
					)
					.limit(1);

				if (!version) {
					return reply.code(404).send({ message: "Version not found" });
				}

				return reply.send({
					data: {
						...version,
						created_at: new Date(version.created_at).toISOString(),
					},
				});
			} catch {
				return reply.code(500).send({ message: "Failed to fetch version" });
			}
		},
	});

	fastify.patch("/agents/:agentId", {
		preHandler: [
			async (request, reply) => {
				const { agentId } = request.params as { agentId: string };
				checkScope(request, reply, `agents:write:${agentId}`);
			},
			requireUserId,
		],
		schema: {
			tags: ["Agents"],
			summary: "Update an agent (rename, tags, deploy)",
			params: {
				type: "object" as const,
				properties: {
					agentId: { type: "string" as const, description: "Agent ID" },
				},
				required: ["agentId"],
			},
			body: {
				type: "object" as const,
				properties: {
					name: {
						type: "string" as const,
						minLength: 1,
						description: "New agent name",
					},
					staging_version_id: {
						type: "string" as const,
						nullable: true,
						description: "ID of version to deploy to staging",
					},
					production_version_id: {
						type: "string" as const,
						nullable: true,
						description: "ID of version to deploy to production",
					},
					tag_ids: {
						type: "array" as const,
						items: { type: "string" as const },
						description:
							"Replacement set of tag IDs. All must belong to the caller's workspace.",
					},
				},
				additionalProperties: false,
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: AgentSchema,
					},
				},
				400: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId } = request.params as {
				workspaceId: string;
				agentId: string;
			};
			const { name, staging_version_id, production_version_id, tag_ids } =
				request.body as {
					name?: string;
					staging_version_id?: string | null;
					production_version_id?: string | null;
					tag_ids?: string[];
				};

			if (
				name === undefined &&
				staging_version_id === undefined &&
				production_version_id === undefined &&
				tag_ids === undefined
			) {
				return reply.code(400).send({ message: "No updates provided" });
			}

			try {
				// Verify agent belongs to workspace
				const [agent] = await db
					.select({ id: agents.id })
					.from(agents)
					.where(
						and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
					)
					.limit(1);

				if (!agent) {
					return reply.code(404).send({ message: "Agent not found" });
				}

				// Validate versions if provided
				const versionIdsToCheck = [
					staging_version_id,
					production_version_id,
				].filter((id): id is string => id !== undefined && id !== null);

				if (versionIdsToCheck.length > 0) {
					const versions = await db
						.select({ id: agentVersions.id })
						.from(agentVersions)
						.where(
							and(
								eq(agentVersions.agent_id, agentId),
								inArray(agentVersions.id, versionIdsToCheck),
							),
						);

					const foundVersionIds = new Set(versions.map((v) => v.id));
					for (const vid of versionIdsToCheck) {
						if (!foundVersionIds.has(vid)) {
							return reply.code(400).send({
								message: `Version ${vid} does not exist for this agent`,
							});
						}
					}
				}

				const updateFields: Partial<typeof agents.$inferInsert> = {};
				if (name !== undefined) {
					const trimmed = name.trim();
					if (trimmed.length === 0) {
						return reply.code(400).send({ message: "name must not be empty" });
					}
					updateFields.name = trimmed;
				}
				if (staging_version_id !== undefined) {
					updateFields.staging_version_id = staging_version_id;
				}
				if (production_version_id !== undefined) {
					updateFields.production_version_id = production_version_id;
				}

				if (Object.keys(updateFields).length > 0) {
					await db
						.update(agents)
						.set(updateFields)
						.where(eq(agents.id, agentId));
				}

				// Handle tags
				if (tag_ids !== undefined) {
					const uniqueTagIds = Array.from(new Set(tag_ids));

					// Validate tags belong to workspace
					if (uniqueTagIds.length > 0) {
						const workspaceTags = await db
							.select({ id: tags.id })
							.from(tags)
							.where(
								and(
									eq(tags.workspace_id, workspaceId),
									inArray(tags.id, uniqueTagIds),
								),
							);

						const foundIds = new Set(workspaceTags.map((t) => t.id));
						const unknown = uniqueTagIds.filter((id) => !foundIds.has(id));
						if (unknown.length > 0) {
							return reply.code(400).send({
								message: `Unknown tag_ids for this workspace: ${unknown.join(", ")}`,
							});
						}
					}

					// Replace the tag set: clear existing links, then insert the new set.
					await db.delete(agentTags).where(eq(agentTags.agent_id, agentId));

					if (uniqueTagIds.length > 0) {
						await db.insert(agentTags).values(
							uniqueTagIds.map((tagId) => ({
								agent_id: agentId,
								tag_id: tagId,
							})),
						);
					}
				}

				// Fetch final agent state
				const [updatedAgent] = await db
					.select(agentColumns)
					.from(agents)
					.where(eq(agents.id, agentId))
					.limit(1);

				if (!updatedAgent) {
					return reply
						.code(500)
						.send({ message: "Failed to fetch updated agent" });
				}

				const [hydrated] = await hydrateAgents([updatedAgent]);
				return reply.code(200).send({ data: hydrated });
			} catch {
				return reply.code(500).send({ message: "Failed to update agent" });
			}
		},
	});

	fastify.delete("/agents/:agentId", {
		preHandler: [
			async (request, reply) => {
				const { agentId } = request.params as { agentId: string };
				checkScope(request, reply, `agents:write:${agentId}`);
			},
			requireUserId,
		],
		schema: {
			tags: ["Agents"],
			summary: "Delete an agent (cascades to its versions and tag links)",
			params: {
				type: "object" as const,
				properties: {
					agentId: { type: "string" as const, description: "Agent ID" },
				},
				required: ["agentId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: { success: { type: "boolean" as const } },
				},
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId } = request.params as {
				workspaceId: string;
				agentId: string;
			};

			let deleted: { id: string }[];
			try {
				deleted = await db
					.delete(agents)
					.where(
						and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
					)
					.returning({ id: agents.id });
			} catch {
				return reply.code(500).send({ message: "Failed to delete agent" });
			}
			if (deleted.length === 0) {
				return reply.code(404).send({ message: "Agent not found" });
			}

			return reply.send({ success: true });
		},
	});

	fastify.post("/agents/:agentId/versions", {
		preHandler: [
			async (request, reply) => {
				const { agentId } = request.params as { agentId: string };
				checkScope(request, reply, `agents:write:${agentId}`);
			},
			requireUserId,
		],
		schema: {
			tags: ["Versions"],
			summary: "Push a new prompt version",
			params: {
				type: "object" as const,
				properties: {
					agentId: { type: "string" as const, description: "Agent ID" },
				},
				required: ["agentId"],
			},
			querystring: {
				type: "object" as const,
				properties: {
					deploy: {
						type: "string" as const,
						enum: ["staging", "production"],
						description: "Deploy this version to staging or production",
					},
				},
			},
			body: {
				type: "object" as const,
				properties: {
					data: {
						type: "object" as const,
						additionalProperties: true,
						description: "Opaque JSON prompt data",
					},
				},
				required: ["data"],
			},
			response: {
				201: {
					type: "object" as const,
					properties: {
						data: VersionDetailSchema,
					},
				},
				400: ErrorSchema,
				404: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId } = request.params as {
				workspaceId: string;
				agentId: string;
			};
			const { deploy } = request.query as { deploy?: "staging" | "production" };
			const { data } = request.body as { data: Record<string, unknown> };

			try {
				// Verify agent belongs to workspace
				const [agent] = await db
					.select({ id: agents.id })
					.from(agents)
					.where(
						and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
					)
					.limit(1);

				if (!agent) {
					return reply.code(404).send({ message: "Agent not found" });
				}

				const versionId = nanoid();
				const userId = userPrincipal(request).userId;

				// Start by inserting the new version
				const [newVersion] = await db
					.insert(agentVersions)
					.values({
						id: versionId,
						agent_id: agentId,
						data,
						is_deployed: !!deploy,
						user_id: userId,
					})
					.returning();

				if (!newVersion) {
					return reply.code(500).send({ message: "Failed to create version" });
				}

				// If deploy is requested, update the agent
				if (deploy) {
					const updateField =
						deploy === "staging"
							? { staging_version_id: versionId }
							: { production_version_id: versionId };
					await db
						.update(agents)
						.set(updateField)
						.where(eq(agents.id, agentId));
				}

				return reply.code(201).send({
					data: {
						...newVersion,
						created_at: new Date(newVersion.created_at).toISOString(),
					},
				});
			} catch {
				return reply.code(500).send({ message: "Failed to create version" });
			}
		},
	});
}
