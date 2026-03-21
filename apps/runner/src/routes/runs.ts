import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";

export async function registerRunsRoutes(fastify: FastifyInstance) {
	fastify.get("/api/v1/runs", async (request, reply) => {
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
			.select("id, version_id, is_error, is_test, is_stream, cost, tokens, response_time, first_token_time, pre_processing_time, created_at, versions!inner(id, agent_id, agents:agent_id(id, name))")
			.eq("workspace_id", workspaceId);

		if (agent_id) {
			query = query.eq("versions.agent_id", agent_id);
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
			const { versions, ...rest } = run;
			return {
				...rest,
				agent: versions?.agents,
			};
		});

		return reply.send({ data: result, page: pageNum, limit: limitNum });
	});

	fastify.get("/api/v1/runs/:runId", async (request, reply) => {
		const { workspaceId } = request;
		const { runId } = request.params as { runId: string };

		const { data: run, error } = await supabase
			.from("runs")
			.select("*, versions(id, agent_id, agents:agent_id(id, name))")
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

		const { versions, ...rest } = run;
		return reply.send({
			data: {
				...rest,
				agent: versions?.agents,
				run_data: runData,
			},
		});
	});
}
