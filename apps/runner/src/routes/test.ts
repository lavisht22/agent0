import { agentVersions, providers, workspaceUser } from "@repo/database";
import { Output, stepCountIs, streamText, type ToolSet } from "ai";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { toWebHeaders } from "../lib/auth/headers.js";
import { auth } from "../lib/auth/index.js";
import { sumUsage } from "../lib/cost.js";
import { createSSEStream } from "../lib/helpers.js";
import { db } from "../lib/pg.js";
import { assembleRun, recordRun } from "../lib/run-agent.js";
import type { VersionData } from "../lib/types.js";

export async function registerTestRoute(fastify: FastifyInstance) {
	fastify.post("/internal/test", async (request, reply) => {
		const startTime = Date.now();
		// Generate up front so agents exposed as tools can link their sub-runs
		// back to this test run as parent_run_id.
		const runId = nanoid();

		// This /internal route is registered outside `addAuth` and validates the
		// browser session itself.
		const session = await auth.api.getSession({
			headers: toWebHeaders(request.headers),
		});

		if (!session) {
			return reply.code(401).send({ message: "Invalid token" });
		}

		const userId = session.user.id;

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

		// Resolve the provider's workspace (also used for run logging).
		const [provider] = await db
			.select({ workspace_id: providers.workspace_id })
			.from(providers)
			.where(eq(providers.id, versionData.model.provider_id))
			.limit(1);

		if (!provider) {
			return reply.code(404).send({ message: "Provider not found" });
		}

		const [membership] = await db
			.select({ user_id: workspaceUser.user_id })
			.from(workspaceUser)
			.where(
				and(
					eq(workspaceUser.workspace_id, provider.workspace_id),
					eq(workspaceUser.user_id, userId),
				),
			)
			.limit(1);

		if (!membership) {
			return reply.code(403).send({ message: "Access denied" });
		}

		// Unsaved drafts have no agent_versions row; log the run without a version
		// link (a non-existent version_id would violate the FK) and seed the cycle
		// guard from the owning agent when resolvable.
		const [versionRow] = version_id
			? await db
					.select({ agent_id: agentVersions.agent_id })
					.from(agentVersions)
					.where(eq(agentVersions.id, version_id))
					.limit(1)
			: [];
		const resolvedVersionId = versionRow ? (version_id ?? null) : null;
		const editedAgentId = versionRow?.agent_id ?? undefined;

		const {
			maxOutputTokens,
			outputFormat,
			temperature,
			maxStepCount,
			providerOptions,
		} = versionData;

		const { model, modelId, finalMessages, allTools, closeAll, runData } =
			await assembleRun(versionData, {
				workspaceId: provider.workspace_id,
				environment,
				runId,
				agentId: editedAgentId,
				variables,
				mcpOptions: mcp_options,
				isTest: true,
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
					environment,
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
					environment,
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
					environment,
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
