import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import { requireScope } from "../lib/scopes.js";

const AgentRefSchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		name: { type: "string" as const },
	},
};

const RunSummarySchema = {
	type: "object" as const,
	properties: {
		id: { type: "string" as const },
		version_id: { type: "string" as const, nullable: true },
		is_error: { type: "boolean" as const },
		is_test: { type: "boolean" as const },
		is_stream: { type: "boolean" as const, nullable: true },
		cost: { type: "number" as const, nullable: true },
		tokens: { type: "number" as const, nullable: true },
		response_time: { type: "number" as const },
		first_token_time: { type: "number" as const },
		pre_processing_time: { type: "number" as const },
		created_at: { type: "string" as const, format: "date-time" },
		agent: AgentRefSchema,
	},
};

const RunDetailSchema = {
	type: "object" as const,
	properties: {
		...RunSummarySchema.properties,
		workspace_id: { type: "string" as const },
		run_data: { type: "object" as const, nullable: true, additionalProperties: true, description: "Full run data including steps, request, and error details. Null if data has been cleaned up." },
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerRunsRoutes(fastify: FastifyInstance) {
	fastify.get("/api/v1/runs", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Runs"],
			summary: "List runs",
			querystring: {
				type: "object" as const,
				properties: {
					agent_id: { type: "string" as const, description: "Filter by agent ID" },
					version_id: { type: "string" as const, description: "Filter by version ID" },
					status: { type: "string" as const, enum: ["success", "failed"], description: "Filter by run status" },
					is_test: { type: "string" as const, enum: ["true", "false"], description: "Filter by test runs" },
					start_date: { type: "string" as const, format: "date-time", description: "Filter runs created on or after this date (ISO 8601)" },
					end_date: { type: "string" as const, format: "date-time", description: "Filter runs created on or before this date (ISO 8601)" },
					page: { type: "string" as const, default: "1", description: "Page number" },
					limit: { type: "string" as const, default: "20", description: "Items per page (max 100)" },
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: { type: "array" as const, items: RunSummarySchema },
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
				agent_id,
				version_id,
				status,
				is_test,
				start_date,
				end_date,
				page = "1",
				limit = "20",
			} = request.query as {
				agent_id?: string;
				version_id?: string;
				status?: string;
				is_test?: string;
				start_date?: string;
				end_date?: string;
				page?: string;
				limit?: string;
			};

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
			const offset = (pageNum - 1) * limitNum;

			let query = supabase
				.from("runs")
				.select("id, version_id, is_error, is_test, is_stream, cost, tokens, response_time, first_token_time, pre_processing_time, created_at, agent_versions!inner(id, agent_id, agents:agent_id(id, name))")
				.eq("workspace_id", workspaceId);

			if (agent_id) {
				query = query.eq("agent_versions.agent_id", agent_id);
			}

			if (version_id) {
				query = query.eq("version_id", version_id);
			}

			if (status === "success") {
				query = query.eq("is_error", false);
			} else if (status === "failed") {
				query = query.eq("is_error", true);
			}

			if (is_test === "true") {
				query = query.eq("is_test", true);
			} else if (is_test === "false") {
				query = query.eq("is_test", false);
			}

			if (start_date) {
				query = query.gte("created_at", start_date);
			}

			if (end_date) {
				query = query.lte("created_at", end_date);
			}

			query = query
				.order("created_at", { ascending: false })
				.range(offset, offset + limitNum - 1);

			const { data: runs, error } = await query;

			if (error) {
				return reply.code(500).send({ message: "Failed to fetch runs" });
			}

			// Flatten the nested version/agent info
			const result = runs.map((run) => {
				const { agent_versions, ...rest } = run;
				return {
					...rest,
					agent: agent_versions?.agents,
				};
			});

			return reply.send({ data: result, page: pageNum, limit: limitNum });
		},
	});

	fastify.get("/api/v1/runs/:runId", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Runs"],
			summary: "Get run details",
			description: "Returns full run details including run data from storage. The run_data field will be null if the data has been cleaned up from storage.",
			params: {
				type: "object" as const,
				properties: {
					runId: { type: "string" as const, description: "Run ID" },
				},
				required: ["runId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: RunDetailSchema,
					},
				},
				404: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request;
			const { runId } = request.params as { runId: string };

			const { data: run, error } = await supabase
				.from("runs")
				.select("*, agent_versions(id, agent_id, agents:agent_id(id, name))")
				.eq("id", runId)
				.eq("workspace_id", workspaceId)
				.single();

			if (error || !run) {
				return reply.code(404).send({ message: "Run not found" });
			}

			// Download run data (steps, request, error details, usage) from storage
			let runData = null;
			const { data: blob, error: storageError } = await supabase.storage
				.from("runs-data")
				.download(`${runId}`);

			if (!storageError && blob) {
				const text = await blob.text();
				runData = JSON.parse(text);
			}

			const { agent_versions, ...rest } = run;
			return reply.send({
				data: {
					...rest,
					agent: agent_versions?.agents,
					run_data: runData,
				},
			});
		},
	});
}
