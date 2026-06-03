import { Output, stepCountIs, streamText, type ToolSet } from "ai";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { sumUsage } from "../lib/cost.js";
import { supabase } from "../lib/db.js";
import { createSSEStream } from "../lib/helpers.js";
import { assembleRun, recordRun } from "../lib/run-agent.js";
import type { VersionData } from "../lib/types.js";

export async function registerTestRoute(fastify: FastifyInstance) {
	fastify.post("/internal/test", async (request, reply) => {
		const startTime = Date.now();
		// Generate up front so agents exposed as tools can link their sub-runs
		// back to this test run as parent_run_id.
		const runId = nanoid();

		// Extract and validate JWT token from Authorization header
		const token = request.headers.authorization?.split("Bearer ")[1];

		if (!token) {
			return reply.code(401).send({ message: "No token provided" });
		}

		// Validate the token with Supabase
		const { data: claims, error: userError } =
			await supabase.auth.getClaims(token);

		if (userError) {
			return reply.code(401).send({ message: "Invalid token" });
		}

		if (!claims) {
			return reply.code(401).send({ message: "Failed to get claims" });
		}

		const {
			data,
			variables,
			version_id,
			mcp_options,
			environment = "staging",
		} = request.body as {
			data: unknown;
			variables: Record<string, string>;
			version_id?: string;
			mcp_options?: Record<string, { headers?: Record<string, string> }>;
			environment?: "staging" | "production";
		};

		const versionData = data as VersionData;

		// Get the provider to check workspace access (also fetch workspace_id for logging)
		const { data: provider, error: providerError } = await supabase
			.from("providers")
			.select("workspace_id, workspaces(workspace_user(user_id, role))")
			.eq("id", versionData.model.provider_id)
			.eq("workspaces.workspace_user.user_id", claims.claims.sub)
			.single();

		if (providerError || !provider) {
			return reply.code(404).send({ message: "Provider not found" });
		}

		if (provider.workspaces.workspace_user.length === 0) {
			return reply.code(403).send({ message: "Access denied" });
		}

		// Resolve the agent/version this draft belongs to. An unsaved draft has no
		// row in agent_versions: we still log the run (so it shows in the dashboard
		// as a test run), just without a version link, and seed the cycle guard
		// from the owning agent when we can resolve it. Logging a non-existent
		// version_id would violate the runs_version_id foreign key.
		const { data: versionRow } = version_id
			? await supabase
					.from("agent_versions")
					.select("agent_id")
					.eq("id", version_id)
					.maybeSingle()
			: { data: null };
		const resolvedVersionId = versionRow ? (version_id ?? null) : null;
		const editedAgentId = versionRow?.agent_id ?? undefined;

		const {
			maxOutputTokens,
			outputFormat,
			temperature,
			maxStepCount,
			providerOptions,
		} = versionData;

		// Assemble the runnable pieces from the (possibly unsaved) draft data —
		// shared with the saved-version path so agent tools, skills, and MCP tools
		// are wired identically.
		const { model, modelId, finalMessages, allTools, closeAll, runData } =
			await assembleRun(versionData, {
				workspaceId: provider.workspace_id,
				environment,
				runId,
				agentId: editedAgentId,
				variables,
				mcpOptions: mcp_options,
			});

		const preProcessingTime = Date.now() - startTime;
		let firstTokenTime: number | null = null;
		let streamCompleted = false;
		const controller = new AbortController();

		const result = streamText({
			model,
			maxOutputTokens,
			temperature,
			stopWhen: stepCountIs(maxStepCount || 10),
			messages: finalMessages,
			tools: allTools as ToolSet,
			output: outputFormat === "json" ? Output.json() : Output.text(),
			providerOptions,
			abortSignal: controller.signal,
			onChunk: () => {
				if (!firstTokenTime) {
					firstTokenTime = Date.now() - preProcessingTime - startTime;
				}
			},
			onFinish: async ({ steps, totalUsage }) => {
				if (streamCompleted) return;
				if (controller.signal.aborted) return;
				streamCompleted = true;
				closeAll();

				runData.steps = steps;
				runData.totalUsage = totalUsage;

				await recordRun({
					id: runId,
					parentRunId: null,
					workspaceId: provider.workspace_id,
					versionId: resolvedVersionId,
					startTime,
					preProcessingTime,
					firstTokenTime: firstTokenTime as number,
					responseTime:
						Date.now() - (firstTokenTime || 0) - preProcessingTime - startTime,
					isError: false,
					isStream: true,
					isTest: true,
					modelId,
					usage: totalUsage,
					runData,
				});
			},
			onError: async ({ error }) => {
				if (streamCompleted) return;
				streamCompleted = true;
				closeAll();

				if (!firstTokenTime) {
					firstTokenTime = Date.now() - preProcessingTime - startTime;
				}

				runData.error = {
					name: error instanceof Error ? error.name : "UnknownError",
					message:
						error instanceof Error ? error.message : "Unknown error occured.",
					cause:
						error instanceof Error
							? (error as Error & { cause?: unknown }).cause
							: undefined,
				};

				await recordRun({
					id: runId,
					parentRunId: null,
					workspaceId: provider.workspace_id,
					versionId: resolvedVersionId,
					startTime,
					preProcessingTime,
					firstTokenTime,
					responseTime:
						Date.now() - (firstTokenTime || 0) - preProcessingTime - startTime,
					isError: true,
					isStream: true,
					isTest: true,
					modelId,
					runData,
				});
			},
			onAbort: async ({ steps }) => {
				if (streamCompleted) return;
				streamCompleted = true;
				closeAll();

				if (!firstTokenTime) {
					firstTokenTime = Date.now() - preProcessingTime - startTime;
				}

				const totalUsage = sumUsage(steps);

				runData.steps = steps;
				runData.totalUsage = totalUsage;
				runData.error = {
					name: "AbortError",
					message: "Run aborted by client disconnect",
				};

				await recordRun({
					id: runId,
					parentRunId: null,
					workspaceId: provider.workspace_id,
					versionId: resolvedVersionId,
					startTime,
					preProcessingTime,
					firstTokenTime,
					responseTime:
						Date.now() - (firstTokenTime || 0) - preProcessingTime - startTime,
					isError: true,
					isStream: true,
					isTest: true,
					modelId,
					usage: totalUsage,
					runData,
				});
			},
		});

		// Abort on client disconnect. See routes/runs.ts for the rationale on
		// listening to both reply.raw and request.raw under Fastify 5 / Cloud Run.
		const handleClientClose = () => {
			if (!streamCompleted) {
				controller.abort();
				closeAll();
			}
		};
		reply.raw.on("close", handleClientClose);
		request.raw.on("close", handleClientClose);

		const stream = createSSEStream(result);

		reply.headers({
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
		});

		return reply.send(stream);
	});
}
