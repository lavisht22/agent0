import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";

export async function registerAgentRoutes(fastify: FastifyInstance) {
	fastify.get("/api/v1/agents/:agentId", async (request, reply) => {
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
	});

	fastify.get("/api/v1/agents", async (request, reply) => {
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
	});
}
