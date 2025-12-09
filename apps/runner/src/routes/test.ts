import { Output, stepCountIs, streamText, type ToolSet } from "ai";
import type { FastifyInstance } from "fastify";
import { supabase } from "../lib/db.js";
import {
	createSSEStream,
	insertRun,
	prepareMCPServers,
	prepareProviderAndMessages,
} from "../lib/helpers.js";
import type { RunData, VersionData } from "../lib/types.js";

export async function registerTestRoute(fastify: FastifyInstance) {
	fastify.post("/api/v1/test", async (request, reply) => {
		const startTime = Date.now();

		const runData: RunData = {
			metrics: {
				preProcessingTime: 0,
				firstTokenTime: 0,
				responseTime: 0,
			},
		};

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

		const { data, variables, version_id } = request.body as {
			data: unknown;
			variables: Record<string, string>;
			version_id: string;
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

		const { maxOutputTokens, outputFormat, temperature, maxStepCount } =
			versionData;

		const [{ model, processedMessages }, { tools, closeAll }] =
			await Promise.all([
				prepareProviderAndMessages(versionData, variables),
				prepareMCPServers(versionData),
			]);

		runData.request = {
			...versionData,
			messages: processedMessages,
			stream: true,
		};

		runData.metrics.preProcessingTime = Date.now() - startTime;

		const result = streamText({
			model,
			maxOutputTokens,
			temperature,
			stopWhen: stepCountIs(maxStepCount || 10),
			messages: processedMessages,
			tools: tools as ToolSet,
			output: outputFormat === "json" ? Output.json() : Output.text(),
			onChunk: () => {
				if (runData.metrics.firstTokenTime === 0) {
					runData.metrics.firstTokenTime =
						Date.now() - runData.metrics.preProcessingTime - startTime;
				}
			},
			onFinish: async ({ steps }) => {
				closeAll();

				runData.metrics.responseTime =
					Date.now() - runData.metrics.preProcessingTime - startTime;
				runData.steps = steps;
				await insertRun(
					provider.workspace_id,
					version_id,
					runData,
					startTime,
					false,
					true,
				);
			},
			onError: async ({ error }) => {
				closeAll();

				if (runData.metrics.firstTokenTime === 0) {
					runData.metrics.firstTokenTime =
						Date.now() - runData.metrics.preProcessingTime - startTime;
				}
				runData.metrics.responseTime =
					Date.now() - runData.metrics.preProcessingTime - startTime;

				runData.error = {
					name: error instanceof Error ? error.name : "UnknownError",
					message:
						error instanceof Error ? error.message : "Unknown error occured.",
					cause:
						error instanceof Error
							? (error as Error & { cause?: unknown }).cause
							: undefined,
				};
				await insertRun(
					provider.workspace_id,
					version_id,
					runData,
					startTime,
					true,
					true,
				);
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
