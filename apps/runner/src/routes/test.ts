import { Output, stepCountIs, streamText, type ToolSet } from "ai";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { calculateModelCost, sumUsage } from "../lib/cost.js";
import { supabase } from "../lib/db.js";
import {
	applyMessageVariables,
	applySkillCatalog,
	createSSEStream,
	prepareMCPServers,
	prepareSkills,
	resolveProviderModel,
	uploadRunData,
} from "../lib/helpers.js";
import { buildAgentTools } from "../lib/run-agent.js";
import type { AgentTool, RunData, VersionData } from "../lib/types.js";

export async function registerTestRoute(fastify: FastifyInstance) {
	fastify.post("/internal/test", async (request, reply) => {
		const startTime = Date.now();
		// Generate up front so agents exposed as tools can link their sub-runs
		// back to this test run as parent_run_id.
		const runId = nanoid();

		const runData: RunData = {};

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
			version_id: string;
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

		const {
			maxOutputTokens,
			outputFormat,
			temperature,
			maxStepCount,
			providerOptions,
		} = versionData;

		const processedMessages = applyMessageVariables(versionData, variables);
		const [
			{ model },
			{ tools, closeAll },
			{ systemAddendum, skillTools },
		] = await Promise.all([
			resolveProviderModel(versionData, environment),
			prepareMCPServers(versionData, environment, mcp_options),
			prepareSkills(versionData),
		]);

		const messagesWithSkills = applySkillCatalog(
			processedMessages,
			systemAddendum,
		);

		// Resolve the edited agent's id so the cycle guard can detect a call back
		// to it. version_id may not resolve for an unsaved draft, in which case we
		// fall back to an empty chain (depth still bounds runaway fan-out).
		const { data: versionRow } = await supabase
			.from("agent_versions")
			.select("agent_id")
			.eq("id", version_id)
			.maybeSingle();
		const activeChain = versionRow?.agent_id ? [versionRow.agent_id] : [];

		// Build tools for any agents exposed as tools (prepareMCPServers ignores
		// "agent" tools). Sub-agents run their deployed versions via runAgent.
		const agentToolDefs = (versionData.tools ?? []).filter(
			(t): t is AgentTool => "type" in t && t.type === "agent",
		);
		const agentTools = buildAgentTools(
			agentToolDefs,
			provider.workspace_id,
			activeChain,
			runId,
		);

		// Skills win on name collision (see run.ts for rationale).
		const allTools = { ...tools, ...agentTools, ...skillTools };

		runData.request = {
			...versionData,
			messages: messagesWithSkills,
		};

		const preProcessingTime = Date.now() - startTime;
		let firstTokenTime: number | null = null;
		let streamCompleted = false;
		const controller = new AbortController();

		const result = streamText({
			model,
			maxOutputTokens,
			temperature,
			stopWhen: stepCountIs(maxStepCount || 10),
			messages: messagesWithSkills,
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
				streamCompleted = true;
				closeAll();

				runData.steps = steps;
				runData.totalUsage = totalUsage;

				await supabase.from("runs").insert({
					id: runId,
					parent_run_id: null,
					workspace_id: provider.workspace_id,
					version_id,
					created_at: new Date(startTime).toISOString(),
					is_error: false,
					is_test: true,
					is_stream: true,
					pre_processing_time: preProcessingTime,
					first_token_time: firstTokenTime as number,
					response_time:
						Date.now() - (firstTokenTime || 0) - preProcessingTime - startTime,
					tokens: totalUsage.totalTokens,
					cost: calculateModelCost(
						typeof model === "string" ? model : model.modelId,
						totalUsage,
					),
				});
				await uploadRunData(runId, runData);
			},
			onError: async ({ error }) => {
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

				await supabase.from("runs").insert({
					id: runId,
					parent_run_id: null,
					workspace_id: provider.workspace_id,
					version_id,
					created_at: new Date(startTime).toISOString(),
					is_error: true,
					is_test: true,
					is_stream: true,
					pre_processing_time: preProcessingTime,
					first_token_time: firstTokenTime,
					response_time:
						Date.now() - (firstTokenTime || 0) - preProcessingTime - startTime,
				});
				await uploadRunData(runId, runData);
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

				await supabase.from("runs").insert({
					id: runId,
					parent_run_id: null,
					workspace_id: provider.workspace_id,
					version_id,
					created_at: new Date(startTime).toISOString(),
					is_error: true,
					is_test: true,
					is_stream: true,
					pre_processing_time: preProcessingTime,
					first_token_time: firstTokenTime,
					response_time:
						Date.now() - (firstTokenTime || 0) - preProcessingTime - startTime,
					tokens: totalUsage.totalTokens,
					cost: calculateModelCost(
						typeof model === "string" ? model : model.modelId,
						totalUsage,
					),
				});
				await uploadRunData(runId, runData);
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
