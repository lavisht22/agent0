import { agentVersions, agents, runs } from "@repo/database";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../lib/pg.js";
import { requireScope } from "../lib/scopes.js";

// Reads at `runs:read:*` (held by every role). Aggregation runs as Drizzle
// queries over `runs` (previously delegated to the `get_dashboard_stats` /
// `get_top_agents` Postgres functions, now removed).
//
// `aborted` runs (client disconnected mid-run) are a distinct terminal status
// and are kept OUT of the success-rate denominator — they are neither a success
// nor a failure, so counting them either way would distort the metric. They are
// surfaced as their own count instead.
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

// Count of rows matching a status, as a plain number (the aggregate comes back
// as a string from Postgres otherwise).
const countWhereStatus = (status: "success" | "error" | "aborted") =>
	sql<number>`count(*) filter (where ${runs.status} = ${status})`.mapWith(
		Number,
	);

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
								aborted_runs: { type: "number" as const },
								// Percentage (0–100) of decisive runs that succeeded, where
								// decisive = total − aborted.
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

			try {
				const conditions = [eq(runs.workspace_id, workspaceId)];
				if (start_date) conditions.push(gte(runs.created_at, start_date));
				if (end_date) conditions.push(lte(runs.created_at, end_date));

				const [row] = await db
					.select({
						total_runs: sql<number>`count(*)`.mapWith(Number),
						successful_runs: countWhereStatus("success"),
						failed_runs: countWhereStatus("error"),
						aborted_runs: countWhereStatus("aborted"),
						total_cost: sql<number>`coalesce(sum(${runs.cost}), 0)`.mapWith(
							Number,
						),
						total_tokens: sql<number>`coalesce(sum(${runs.tokens}), 0)`.mapWith(
							Number,
						),
						avg_response_time:
							sql<number>`coalesce(avg(${runs.response_time}), 0)`.mapWith(
								Number,
							),
					})
					.from(runs)
					.where(and(...conditions));

				// Aborted runs are excluded from the denominator so a spike in client
				// disconnects doesn't drag the success rate down.
				const decisiveRuns = row.total_runs - row.aborted_runs;
				const success_rate =
					decisiveRuns > 0 ? (row.successful_runs / decisiveRuns) * 100 : 0;

				return reply.send({ data: { ...row, success_rate } });
			} catch {
				return reply
					.code(500)
					.send({ message: "Failed to compute dashboard stats" });
			}
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
									aborted: { type: "number" as const },
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

			try {
				const conditions = [eq(runs.workspace_id, workspaceId)];
				if (start_date) conditions.push(gte(runs.created_at, start_date));
				if (end_date) conditions.push(lte(runs.created_at, end_date));

				const data = await db
					.select({
						id: agents.id,
						name: agents.name,
						runs: sql<number>`count(*)`.mapWith(Number),
						errors: countWhereStatus("error"),
						aborted: countWhereStatus("aborted"),
						cost: sql<number>`coalesce(sum(${runs.cost}), 0)`.mapWith(Number),
					})
					.from(runs)
					.innerJoin(agentVersions, eq(runs.version_id, agentVersions.id))
					.innerJoin(agents, eq(agentVersions.agent_id, agents.id))
					.where(and(...conditions))
					.groupBy(agents.id, agents.name)
					.orderBy(desc(sql`count(*)`))
					.limit(limit ?? 5);

				return reply.send({ data });
			} catch {
				return reply
					.code(500)
					.send({ message: "Failed to compute top agents" });
			}
		},
	});
}
