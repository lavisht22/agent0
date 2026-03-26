import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";

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
	fastify.get("/api/v1/agents/:agentId", {
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
			const { workspaceId } = request;
			const { agentId } = request.params as { agentId: string };

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

	fastify.get("/api/v1/agents", {
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
			const { workspaceId } = request;

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

	// List versions for an agent (excludes version data/content for lighter response)
	fastify.get("/api/v1/agents/:agentId/versions", {
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
			const { workspaceId } = request;
			const { agentId } = request.params as { agentId: string };

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
	fastify.get("/api/v1/agents/:agentId/versions/:versionId", {
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
			const { workspaceId } = request;
			const { agentId, versionId } = request.params as { agentId: string; versionId: string };

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
}
