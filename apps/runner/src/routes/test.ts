import { Output, stepCountIs, streamText, type ToolSet } from "ai";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { calculateModelCost } from "../lib/cost.js";
import { supabase } from "../lib/db.js";
import {
	createSSEStream,
	prepareMCPServers,
	prepareProviderAndMessages,
	uploadRunData,
} from "../lib/helpers.js";
import type { RunData, VersionData } from "../lib/types.js";

export async function registerTestRoute(fastify: FastifyInstance) {
	fastify.post("/api/v1/test", async (request, reply) => {
		const startTime = Date.now();

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

		const { data, variables, version_id, mcp_options } = request.body as {
			data: unknown;
			variables: Record<string, string>;
			version_id: string;
			mcp_options?: Record<string, { headers?: Record<string, string> }>;
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

		const [{ model, processedMessages }, { tools, closeAll }] =
			await Promise.all([
				prepareProviderAndMessages(versionData, variables),
				prepareMCPServers(versionData, mcp_options),
			]);

		runData.request = {
			...versionData,
			messages: processedMessages,
		};

		const preProcessingTime = Date.now() - startTime;
		let firstTokenTime: number | null = null;

		const result = streamText({
			model,
			maxOutputTokens,
			temperature,
			stopWhen: stepCountIs(maxStepCount || 10),
			messages: processedMessages,
			tools: tools as ToolSet,
			output: outputFormat === "json" ? Output.json() : Output.text(),
			providerOptions,
			onChunk: () => {
				if (!firstTokenTime) {
					firstTokenTime = Date.now() - preProcessingTime - startTime;
				}
			},
			onFinish: async ({ steps, totalUsage }) => {
				closeAll();

				runData.steps = steps;
				runData.totalUsage = totalUsage;

				const id = nanoid();
				await supabase.from("runs").insert({
					id,
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
				await uploadRunData(id, runData);
			},
			onError: async ({ error }) => {
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

				const id = nanoid();
				await supabase.from("runs").insert({
					id,
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
				await uploadRunData(id, runData);
			},
		});

		const stream = createSSEStream(result);

		reply.headers({
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
		});

		return reply.send(stream);
	});
}
