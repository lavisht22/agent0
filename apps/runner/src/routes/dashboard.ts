import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { requireScope } from "../lib/scopes.js";

// The dashboard is run analytics, so it reads at `runs:read:*` (held by every
// workspace role), same as the runs list. Aggregation is delegated to the
// `get_dashboard_stats` / `get_top_agents` Postgres functions so it happens
// DB-side rather than over a capped row fetch.

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

const DateRangeQuery = {
	type: "object" as const,
	properties: {
		start_date: { type: "string" as const, format: "date-time" },
		end_date: { type: "string" as const, format: "date-time" },
	},
};

export async function registerDashboardRoutes(fastify: FastifyInstance) {
	fastify.get("/dashboard/stats", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Dashboard"],
			summary: "Aggregate run statistics for a workspace",
			querystring: DateRangeQuery,
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								total_runs: { type: "number" as const },
								successful_runs: { type: "number" as const },
								failed_runs: { type: "number" as const },
								success_rate: { type: "number" as const },
								total_cost: { type: "number" as const },
								total_tokens: { type: "number" as const },
								avg_response_time: { type: "number" as const },
							},
						},
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const { start_date, end_date } = request.query as {
				start_date?: string;
				end_date?: string;
			};

			const { data, error } = await supabase.rpc("get_dashboard_stats", {
				p_workspace_id: workspaceId,
				p_start_date: start_date,
				p_end_date: end_date,
			});

			if (error) {
				return reply
					.code(500)
					.send({ message: "Failed to compute dashboard stats" });
			}

			return reply.send({ data });
		},
	});

	fastify.get("/dashboard/top-agents", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Dashboard"],
			summary: "Top agents by run count for a workspace",
			querystring: {
				type: "object" as const,
				properties: {
					...DateRangeQuery.properties,
					limit: {
						type: "integer" as const,
						minimum: 1,
						maximum: 100,
						default: 5,
					},
				},
			},
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
									runs: { type: "number" as const },
									errors: { type: "number" as const },
									cost: { type: "number" as const },
								},
							},
						},
					},
				},
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const { start_date, end_date, limit } = request.query as {
				start_date?: string;
				end_date?: string;
				limit?: number;
			};

			const { data, error } = await supabase.rpc("get_top_agents", {
				p_workspace_id: workspaceId,
				p_start_date: start_date,
				p_end_date: end_date,
				p_limit: limit ?? 5,
			});

			if (error) {
				return reply
					.code(500)
					.send({ message: "Failed to compute top agents" });
			}

			return reply.send({ data });
		},
	});
}
