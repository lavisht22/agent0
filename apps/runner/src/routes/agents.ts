import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { supabase } from "../lib/db.js";
import { checkScope, requireScope, requireUserId } from "../lib/scopes.js";

const TagSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
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
		tags: { type: "array" as const, items: TagSchema },
		created_at: { type: "string" as const, format: "date-time" },
		updated_at: { type: "string" as const, format: "date-time" },
	},
};

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

			const { data: agent, error } = await supabase
				.from("agents")
				.select("id, name, staging_version_id, production_version_id, created_at, updated_at, agent_tags(tags(id, name))")
				.eq("id", agentId)
				.eq("workspace_id", workspaceId)
				.single();

			if (error || !agent) {
				return reply.code(404).send({ message: "Agent not found" });
			}

			return reply.send({
				data: {
					id: agent.id,
					name: agent.name,
					staging_version_id: agent.staging_version_id,
					production_version_id: agent.production_version_id,
					tags: agent.agent_tags
						?.map((at) => at.tags)
						.filter(Boolean),
					created_at: agent.created_at,
					updated_at: agent.updated_at,
				},
			});
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
					search: { type: "string" as const, description: "Search agents by name" },
					tag_ids: { type: "string" as const, description: "Comma-separated tag IDs to filter by (agents must have ALL specified tags)" },
					page: { type: "string" as const, default: "1", description: "Page number" },
					limit: { type: "string" as const, default: "20", description: "Items per page (max 100)" },
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
			const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
			const offset = (pageNum - 1) * limitNum;

			// If tag_ids provided, filter agents that have ALL specified tags
			let matchingAgentIds: string[] | null = null;

			if (tag_ids) {
				const tagIdList = tag_ids.split(",").filter(Boolean);

				if (tagIdList.length > 0) {
					const { data: agentTags, error: tagError } = await supabase
						.from("agent_tags")
						.select("agent_id")
						.in("tag_id", tagIdList);

					if (tagError) {
						return reply.code(500).send({ message: "Failed to filter by tags" });
					}

					// Only include agents that have ALL selected tags
					const agentIdCounts = agentTags.reduce(
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

			let query = supabase
				.from("agents")
				.select("id, name, staging_version_id, production_version_id, created_at, updated_at, agent_tags(tags(id, name))")
				.eq("workspace_id", workspaceId);

			if (matchingAgentIds) {
				query = query.in("id", matchingAgentIds);
			}

			if (search) {
				query = query.ilike("name", `%${search}%`);
			}

			query = query
				.order("created_at", { ascending: false })
				.range(offset, offset + limitNum - 1);

			const { data: agents, error } = await query;

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch agents" });
			}

			// Flatten tags for cleaner response
			const result = agents.map((agent) => ({
				id: agent.id,
				name: agent.name,
				staging_version_id: agent.staging_version_id,
				production_version_id: agent.production_version_id,
				tags: agent.agent_tags
					?.map((at) => at.tags)
					.filter(Boolean),
				created_at: agent.created_at,
				updated_at: agent.updated_at,
			}));

			return reply.send({ data: result, page: pageNum, limit: limitNum });
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
					name: { type: "string" as const, minLength: 1, description: "Agent name" },
					tag_ids: {
						type: "array" as const,
						items: { type: "string" as const },
						description: "Optional tag IDs to attach. All must belong to the caller's workspace.",
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

			if (uniqueTagIds.length > 0) {
				const { data: workspaceTags, error: tagLookupError } = await supabase
					.from("tags")
					.select("id")
					.eq("workspace_id", workspaceId)
					.in("id", uniqueTagIds);

				if (tagLookupError) {
					return reply.code(500).send({ message: "Failed to validate tags" });
				}

				const foundIds = new Set(workspaceTags.map((t) => t.id));
				const unknown = uniqueTagIds.filter((id) => !foundIds.has(id));
				if (unknown.length > 0) {
					return reply.code(400).send({
						message: `Unknown tag_ids for this workspace: ${unknown.join(", ")}`,
					});
				}
			}

			const agentId = nanoid();
			const { data: created, error: insertError } = await supabase
				.from("agents")
				.insert({
					id: agentId,
					name: trimmedName,
					workspace_id: workspaceId,
				})
				.select("id, name, staging_version_id, production_version_id, created_at, updated_at")
				.single();

			if (insertError || !created) {
				return reply.code(500).send({ message: "Failed to create agent" });
			}

			if (uniqueTagIds.length > 0) {
				const { error: tagInsertError } = await supabase
					.from("agent_tags")
					.insert(uniqueTagIds.map((tagId) => ({ agent_id: agentId, tag_id: tagId })));

				if (tagInsertError) {
					// Roll back the agent so the caller doesn't end up with a half-created record.
					await supabase.from("agents").delete().eq("id", agentId);
					return reply.code(500).send({ message: "Failed to attach tags" });
				}
			}

			const { data: tagRows, error: tagFetchError } = await supabase
				.from("agent_tags")
				.select("tags(id, name)")
				.eq("agent_id", agentId);

			if (tagFetchError) {
				return reply.code(500).send({ message: "Failed to load agent tags" });
			}

			return reply.code(201).send({
				data: {
					id: created.id,
					name: created.name,
					staging_version_id: created.staging_version_id,
					production_version_id: created.production_version_id,
					tags: tagRows?.map((row) => row.tags).filter(Boolean) ?? [],
					created_at: created.created_at,
					updated_at: created.updated_at,
				},
			});
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
					page: { type: "string" as const, default: "1", description: "Page number" },
					limit: { type: "string" as const, default: "20", description: "Items per page (max 100)" },
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

			const {
				page = "1",
				limit = "20",
			} = request.query as {
				page?: string;
				limit?: string;
			};

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
			const offset = (pageNum - 1) * limitNum;

			// Verify agent belongs to workspace
			const { data: agent, error: agentError } = await supabase
				.from("agents")
				.select("id")
				.eq("id", agentId)
				.eq("workspace_id", workspaceId)
				.single();

			if (agentError || !agent) {
				return reply.code(404).send({ message: "Agent not found" });
			}

			const { data: versions, error } = await supabase
				.from("agent_versions")
				.select("id, agent_id, is_deployed, user_id, created_at")
				.eq("agent_id", agentId)
				.order("created_at", { ascending: false })
				.range(offset, offset + limitNum - 1);

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch versions" });
			}

			return reply.send({ data: versions, page: pageNum, limit: limitNum });
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
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, agentId, versionId } = request.params as {
				workspaceId: string;
				agentId: string;
				versionId: string;
			};

			// Verify agent belongs to workspace
			const { data: agent, error: agentError } = await supabase
				.from("agents")
				.select("id")
				.eq("id", agentId)
				.eq("workspace_id", workspaceId)
				.single();

			if (agentError || !agent) {
				return reply.code(404).send({ message: "Agent not found" });
			}

			const { data: version, error } = await supabase
				.from("agent_versions")
				.select("*")
				.eq("id", versionId)
				.eq("agent_id", agentId)
				.single();

			if (error || !version) {
				return reply.code(404).send({ message: "Version not found" });
			}

			return reply.send({ data: version });
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
					name: { type: "string" as const, minLength: 1, description: "New agent name" },
					staging_version_id: { type: "string" as const, nullable: true, description: "ID of version to deploy to staging" },
					production_version_id: { type: "string" as const, nullable: true, description: "ID of version to deploy to production" },
					tag_ids: {
						type: "array" as const,
						items: { type: "string" as const },
						description: "Replacement set of tag IDs. All must belong to the caller's workspace.",
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

			// Verify agent belongs to workspace
			const { data: agent, error: agentError } = await supabase
				.from("agents")
				.select("id")
				.eq("id", agentId)
				.eq("workspace_id", workspaceId)
				.single();

			if (agentError || !agent) {
				return reply.code(404).send({ message: "Agent not found" });
			}

			// Validate versions if provided
			const versionIdsToCheck = [staging_version_id, production_version_id].filter(
				(id): id is string => id !== undefined && id !== null,
			);

			if (versionIdsToCheck.length > 0) {
				const { data: versions, error: versionsError } = await supabase
					.from("agent_versions")
					.select("id")
					.eq("agent_id", agentId)
					.in("id", versionIdsToCheck);

				if (versionsError) {
					return reply.code(500).send({ message: "Failed to validate versions" });
				}

				const foundVersionIds = new Set(versions.map((v) => v.id));
				for (const vid of versionIdsToCheck) {
					if (!foundVersionIds.has(vid)) {
						return reply.code(400).send({
							message: `Version ${vid} does not exist for this agent`,
						});
					}
				}
			}

			const updateFields: Record<string, any> = {};
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
				const { error: updateError } = await supabase
					.from("agents")
					.update(updateFields)
					.eq("id", agentId);

				if (updateError) {
					return reply.code(500).send({ message: "Failed to update agent" });
				}
			}

			// Handle tags
			if (tag_ids !== undefined) {
				const uniqueTagIds = Array.from(new Set(tag_ids));

				// Validate tags belong to workspace
				if (uniqueTagIds.length > 0) {
					const { data: workspaceTags, error: tagLookupError } = await supabase
						.from("tags")
						.select("id")
						.eq("workspace_id", workspaceId)
						.in("id", uniqueTagIds);

					if (tagLookupError) {
						return reply.code(500).send({ message: "Failed to validate tags" });
					}

					const foundIds = new Set(workspaceTags.map((t) => t.id));
					const unknown = uniqueTagIds.filter((id) => !foundIds.has(id));
					if (unknown.length > 0) {
						return reply.code(400).send({
							message: `Unknown tag_ids for this workspace: ${unknown.join(", ")}`,
						});
					}
				}

				// Delete existing tags
				const { error: deleteError } = await supabase
					.from("agent_tags")
					.delete()
					.eq("agent_id", agentId);

				if (deleteError) {
					return reply.code(500).send({ message: "Failed to clear existing tags" });
				}

				// Insert new tags
				if (uniqueTagIds.length > 0) {
					const { error: insertError } = await supabase
						.from("agent_tags")
						.insert(
							uniqueTagIds.map((tagId) => ({ agent_id: agentId, tag_id: tagId })),
						);

					if (insertError) {
						return reply.code(500).send({ message: "Failed to attach new tags" });
					}
				}
			}

			// Fetch final agent state
			const { data: updatedAgent, error: fetchError } = await supabase
				.from("agents")
				.select(
					"id, name, staging_version_id, production_version_id, created_at, updated_at, agent_tags(tags(id, name))",
				)
				.eq("id", agentId)
				.single();

			if (fetchError || !updatedAgent) {
				return reply.code(500).send({ message: "Failed to fetch updated agent" });
			}

			return reply.code(200).send({
				data: {
					id: updatedAgent.id,
					name: updatedAgent.name,
					staging_version_id: updatedAgent.staging_version_id,
					production_version_id: updatedAgent.production_version_id,
					tags:
						updatedAgent.agent_tags?.map((at) => at.tags).filter(Boolean) ?? [],
					created_at: updatedAgent.created_at,
					updated_at: updatedAgent.updated_at,
				},
			});
		},
	});
}
