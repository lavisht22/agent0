import { agents, agentVersions, runs } from "@repo/database";
import {
	generateText,
	type ModelMessage,
	Output,
	type StepResult,
	stepCountIs,
	streamText,
	type ToolSet,
} from "ai";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { userPrincipal } from "../lib/auth.js";
import { sumUsage } from "../lib/cost.js";
import { createSSEStream } from "../lib/helpers.js";
import { MetadataError, parseRunMetadata } from "../lib/metadata.js";
import { db } from "../lib/pg.js";
import { prepareRun, RunPrepError, recordRun } from "../lib/run-agent.js";
import {
	getRetentionSettings,
	previewCleanup,
	runCleanup,
} from "../lib/run-cleanup.js";
import { hasScope, requireScope, requireUserId } from "../lib/scopes.js";
import { runLogStore } from "../lib/storage.js";
import type { RunOverrides } from "../lib/types.js";
import { requireAdminOrOwner } from "../lib/workspace-access.js";

// `agent_*` columns come from agent_versions → agents and are folded into a
// nested `agent` object by shapeRun.
const runSelectColumns = {
	id: runs.id,
	version_id: runs.version_id,
	environment: runs.environment,
	parent_run_id: runs.parent_run_id,
	status: runs.status,
	is_test: runs.is_test,
	is_stream: runs.is_stream,
	cost: runs.cost,
	tokens: runs.tokens,
	response_time: runs.response_time,
	first_token_time: runs.first_token_time,
	pre_processing_time: runs.pre_processing_time,
	created_at: runs.created_at,
	metadata: runs.metadata,
	agent_id: agents.id,
	agent_name: agents.name,
};

// Normalize a joined run row to the API shape; `agent` is null when the run's
// version is unsaved or since-deleted.
function shapeRun<
	T extends {
		agent_id: string | null;
		agent_name: string | null;
		cost: string | null;
		tokens: string | null;
		response_time: string;
		first_token_time: string;
		pre_processing_time: string;
		created_at: string;
	},
>(row: T) {
	const {
		agent_id,
		agent_name,
		cost,
		tokens,
		response_time,
		first_token_time,
		pre_processing_time,
		created_at,
		...rest
	} = row;
	return {
		...rest,
		cost: cost === null ? null : Number(cost),
		tokens: tokens === null ? null : Number(tokens),
		response_time: Number(response_time),
		first_token_time: Number(first_token_time),
		pre_processing_time: Number(pre_processing_time),
		created_at: new Date(created_at).toISOString(),
		agent: agent_id ? { id: agent_id, name: agent_name } : null,
	};
}

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
		environment: { type: "string" as const, enum: ["staging", "production"] },
		parent_run_id: {
			type: "string" as const,
			nullable: true,
			description:
				"ID of the run that invoked this one (agent-as-tool). Null for top-level runs.",
		},
		status: {
			type: "string" as const,
			enum: ["success", "error", "aborted"],
			description: "Terminal outcome of the run.",
		},
		is_test: { type: "boolean" as const },
		is_stream: { type: "boolean" as const, nullable: true },
		cost: { type: "number" as const, nullable: true },
		tokens: { type: "number" as const, nullable: true },
		response_time: { type: "number" as const },
		first_token_time: { type: "number" as const },
		pre_processing_time: { type: "number" as const },
		created_at: { type: "string" as const, format: "date-time" },
		metadata: {
			type: "object" as const,
			nullable: true,
			additionalProperties: { type: "string" as const },
			description:
				"Arbitrary string key-value labels attached at run time for filtering. Null when none supplied.",
		},
		agent: { ...AgentRefSchema, nullable: true },
	},
};

const RunDetailSchema = {
	type: "object" as const,
	properties: {
		...RunSummarySchema.properties,
		workspace_id: { type: "string" as const },
		run_data: {
			type: "object" as const,
			nullable: true,
			additionalProperties: true,
			description:
				"Full run data including steps, request, and error details. Null if data has been cleaned up.",
		},
	},
};

const ErrorSchema = {
	type: "object" as const,
	properties: {
		message: { type: "string" as const },
	},
};

export async function registerRunsRoutes(fastify: FastifyInstance) {
	fastify.get("/runs", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Runs"],
			summary: "List runs",
			querystring: {
				type: "object" as const,
				properties: {
					agent_id: {
						type: "string" as const,
						description: "Filter by agent ID",
					},
					version_id: {
						type: "string" as const,
						description: "Filter by version ID",
					},
					parent_run_id: {
						type: "string" as const,
						description:
							"Filter by the run that invoked these (agent-as-tool children)",
					},
					status: {
						type: "string" as const,
						enum: ["success", "failed", "aborted"],
						description:
							"Filter by run status. `failed` matches errored runs; `aborted` matches runs cancelled by client disconnect.",
					},
					environment: {
						type: "string" as const,
						enum: ["staging", "production"],
						description: "Filter by the environment the run was created in",
					},
					is_test: {
						type: "string" as const,
						enum: ["true", "false"],
						description: "Filter by test runs",
					},
					start_date: {
						type: "string" as const,
						format: "date-time",
						description: "Filter runs created on or after this date (ISO 8601)",
					},
					end_date: {
						type: "string" as const,
						format: "date-time",
						description:
							"Filter runs created on or before this date (ISO 8601)",
					},
					metadata: {
						type: "string" as const,
						description:
							'JSON object of metadata key-values to match, e.g. {"user_id":"u_123"}. Matches runs whose metadata contains all given pairs (exact match, AND across keys).',
					},
					page: {
						type: "string" as const,
						default: "1",
						description: "Page number",
					},
					limit: {
						type: "string" as const,
						default: "20",
						description: "Items per page (max 100)",
					},
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
				400: ErrorSchema,
				500: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };

			const {
				agent_id,
				version_id,
				parent_run_id,
				status,
				environment,
				is_test,
				start_date,
				end_date,
				metadata,
				page = "1",
				limit = "20",
			} = request.query as {
				agent_id?: string;
				version_id?: string;
				parent_run_id?: string;
				status?: string;
				environment?: string;
				is_test?: string;
				start_date?: string;
				end_date?: string;
				metadata?: string;
				page?: string;
				limit?: string;
			};

			// Parse the metadata filter up front so a malformed value is a clear 400
			// rather than a 500 from the query builder.
			let metadataFilter: Record<string, string> | undefined;
			if (metadata) {
				let parsed: unknown;
				try {
					parsed = JSON.parse(metadata);
				} catch {
					return reply
						.code(400)
						.send({ message: "metadata must be a valid JSON object" });
				}
				try {
					metadataFilter = parseRunMetadata(parsed);
				} catch (err) {
					if (err instanceof MetadataError) {
						return reply.code(400).send({ message: err.message });
					}
					throw err;
				}
			}

			const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
			const limitNum = Math.min(
				100,
				Math.max(1, Number.parseInt(limit, 10) || 20),
			);
			const offset = (pageNum - 1) * limitNum;

			// Left join by default so runs whose agent version is null (unsaved or
			// since-deleted agents) still appear. Switch to an inner join only when
			// filtering by agent_id, since that filter inherently excludes
			// null-version runs anyway.
			const conditions = [eq(runs.workspace_id, workspaceId)];
			if (agent_id) conditions.push(eq(agentVersions.agent_id, agent_id));
			if (version_id) conditions.push(eq(runs.version_id, version_id));
			if (parent_run_id) {
				conditions.push(eq(runs.parent_run_id, parent_run_id));
			}
			if (status === "success") {
				conditions.push(eq(runs.status, "success"));
			} else if (status === "failed") {
				conditions.push(eq(runs.status, "error"));
			} else if (status === "aborted") {
				conditions.push(eq(runs.status, "aborted"));
			}
			if (environment === "staging" || environment === "production") {
				conditions.push(eq(runs.environment, environment));
			}
			if (is_test === "true") {
				conditions.push(eq(runs.is_test, true));
			} else if (is_test === "false") {
				conditions.push(eq(runs.is_test, false));
			}
			if (start_date) conditions.push(gte(runs.created_at, start_date));
			if (end_date) conditions.push(lte(runs.created_at, end_date));
			// jsonb containment: matches rows whose metadata holds all given pairs.
			// Served by the partial GIN index on runs.metadata.
			if (metadataFilter) {
				conditions.push(
					sql`${runs.metadata} @> ${JSON.stringify(metadataFilter)}::jsonb`,
				);
			}

			try {
				const base = db.select(runSelectColumns).from(runs);
				const joined = agent_id
					? base
							.innerJoin(agentVersions, eq(runs.version_id, agentVersions.id))
							.innerJoin(agents, eq(agentVersions.agent_id, agents.id))
					: base
							.leftJoin(agentVersions, eq(runs.version_id, agentVersions.id))
							.leftJoin(agents, eq(agentVersions.agent_id, agents.id));

				const rows = await joined
					.where(and(...conditions))
					.orderBy(desc(runs.created_at))
					.limit(limitNum)
					.offset(offset);

				const result = rows.map(shapeRun);

				return reply.send({ data: result, page: pageNum, limit: limitNum });
			} catch {
				return reply.code(500).send({ message: "Failed to fetch runs" });
			}
		},
	});

	fastify.get("/runs/:runId", {
		preHandler: requireScope("runs:read:*"),
		schema: {
			tags: ["Runs"],
			summary: "Get run details",
			description:
				"Returns full run details including run data from storage. The run_data field will be null if the data has been cleaned up from storage.",
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
			const { workspaceId, runId } = request.params as {
				workspaceId: string;
				runId: string;
			};

			const [run] = await db
				.select({
					...runSelectColumns,
					workspace_id: runs.workspace_id,
					log_deleted_at: runs.log_deleted_at,
				})
				.from(runs)
				.leftJoin(agentVersions, eq(runs.version_id, agentVersions.id))
				.leftJoin(agents, eq(agentVersions.agent_id, agents.id))
				.where(and(eq(runs.id, runId), eq(runs.workspace_id, workspaceId)))
				.limit(1);

			if (!run) {
				return reply.code(404).send({ message: "Run not found" });
			}

			// Skip the S3 round-trip when the log has been purged by retention
			// cleanup; otherwise null means it was never stored / already gone.
			const runData = run.log_deleted_at ? null : await runLogStore.get(runId);

			return reply.send({
				data: {
					...shapeRun(run),
					run_data: runData,
				},
			});
		},
	});

	// Replace a run's metadata labels. Lets users tag existing runs after the
	// fact (e.g. to mark runs for a teammate to filter). Send an empty object to
	// clear. Full replace, not a merge — the editor sends the complete set.
	fastify.patch("/runs/:runId", {
		preHandler: requireScope("runs:write:*"),
		schema: {
			tags: ["Runs"],
			summary: "Update run metadata",
			description:
				"Replace the run's metadata labels. Send an empty object to clear all. Max 10 keys; each key and value must be under 128 characters.",
			params: {
				type: "object" as const,
				properties: {
					runId: { type: "string" as const, description: "Run ID" },
				},
				required: ["runId"],
			},
			body: {
				type: "object" as const,
				required: ["metadata"],
				properties: {
					metadata: {
						type: "object" as const,
						additionalProperties: { type: "string" as const },
						description:
							"The full set of key-value labels to store on the run.",
					},
				},
			},
			response: {
				200: {
					type: "object" as const,
					properties: { data: RunSummarySchema },
				},
				400: ErrorSchema,
				404: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId, runId } = request.params as {
				workspaceId: string;
				runId: string;
			};
			const { metadata: rawMetadata } = request.body as {
				metadata?: Record<string, string>;
			};

			let metadata: Record<string, string> | undefined;
			try {
				metadata = parseRunMetadata(rawMetadata);
			} catch (err) {
				if (err instanceof MetadataError) {
					return reply.code(400).send({ message: err.message });
				}
				throw err;
			}

			const updated = await db
				.update(runs)
				.set({ metadata: metadata ?? null })
				.where(and(eq(runs.id, runId), eq(runs.workspace_id, workspaceId)))
				.returning({ id: runs.id });

			if (updated.length === 0) {
				return reply.code(404).send({ message: "Run not found" });
			}

			// Re-select with the agent join so the response matches the list/detail
			// shape (update...returning can't join).
			const [row] = await db
				.select(runSelectColumns)
				.from(runs)
				.leftJoin(agentVersions, eq(runs.version_id, agentVersions.id))
				.leftJoin(agents, eq(agentVersions.agent_id, agents.id))
				.where(and(eq(runs.id, runId), eq(runs.workspace_id, workspaceId)))
				.limit(1);

			return reply.send({ data: shapeRun(row) });
		},
	});

	// How many runs the workspace's retention windows currently make eligible for
	// cleanup. Drives the "Clean up" button's visibility and the confirm dialog.
	fastify.get("/runs/cleanup/preview", {
		preHandler: requireUserId,
		schema: {
			tags: ["Runs"],
			summary: "Preview retention cleanup",
			description:
				"Counts of runs eligible for cleanup under the workspace's retention windows. Admin/owner only.",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
			},
			response: {
				200: {
					type: "object" as const,
					properties: {
						data: {
							type: "object" as const,
							properties: {
								logs_eligible: { type: "number" as const },
								runs_eligible: { type: "number" as const },
							},
						},
					},
				},
				403: ErrorSchema,
				404: ErrorSchema,
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const userId = userPrincipal(request).userId;

			if (!(await requireAdminOrOwner(request, reply, workspaceId, userId))) {
				return;
			}

			const settings = await getRetentionSettings(workspaceId);
			if (!settings) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			const preview = await previewCleanup(workspaceId, settings);
			return reply.send({ data: preview });
		},
	});

	// Run retention cleanup, streaming progress as SSE. Reads the windows from
	// workspace settings (never the request body). Admin/owner only.
	fastify.post("/runs/cleanup", {
		preHandler: requireUserId,
		schema: {
			tags: ["Runs"],
			summary: "Run retention cleanup (SSE)",
			description:
				"Deletes runs past the workspace's retention windows, streaming progress events. Admin/owner only.",
			params: {
				type: "object" as const,
				properties: { workspaceId: { type: "string" as const } },
				required: ["workspaceId"],
			},
		},
		handler: async (request, reply) => {
			const { workspaceId } = request.params as { workspaceId: string };
			const userId = userPrincipal(request).userId;

			if (!(await requireAdminOrOwner(request, reply, workspaceId, userId))) {
				return;
			}

			const settings = await getRetentionSettings(workspaceId);
			if (!settings) {
				return reply.code(404).send({ message: "Workspace not found" });
			}

			// Stop the cleanup loop (between batches) when the client goes away, so
			// we don't keep deleting for a browser that's no longer listening. Work
			// is resumable, so the user can re-trigger to continue.
			const controller = new AbortController();
			let finished = false;
			const handleClientClose = () => {
				if (!finished) controller.abort();
			};
			reply.raw.on("close", handleClientClose);
			request.raw.on("close", handleClientClose);

			const encoder = new TextEncoder();
			const PING_INTERVAL_MS = 5000;
			const stream = new ReadableStream({
				async start(streamController) {
					const ping = setInterval(() => {
						try {
							streamController.enqueue(encoder.encode(": ping\r\n\r\n"));
						} catch {
							// Controller may be closed.
						}
					}, PING_INTERVAL_MS);
					try {
						for await (const event of runCleanup(
							workspaceId,
							settings,
							controller.signal,
						)) {
							streamController.enqueue(
								encoder.encode(`data: ${JSON.stringify(event)}\r\n\r\n`),
							);
						}
					} catch (err) {
						console.error("Cleanup streaming error", err);
						try {
							streamController.enqueue(
								encoder.encode(
									`data: ${JSON.stringify({ type: "error", message: "Cleanup failed" })}\r\n\r\n`,
								),
							);
						} catch {
							// Already closed.
						}
					} finally {
						finished = true;
						clearInterval(ping);
						try {
							streamController.close();
						} catch {
							// Already closed.
						}
					}
				},
			});

			reply.headers({
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
			});
			return reply.send(stream);
		},
	});

	fastify.post("/runs", {
		schema: {
			tags: ["Run"],
			summary: "Run an agent",
			description:
				"Execute an agent with optional streaming, variable substitution, overrides, extra messages, and custom tools.",
			body: {
				type: "object" as const,
				required: ["agent_id"],
				properties: {
					agent_id: {
						type: "string" as const,
						description: "The agent to run",
					},
					environment: {
						type: "string" as const,
						enum: ["staging", "production"],
						default: "production",
						description: "Which deployed version to use",
					},
					variables: {
						type: "object" as const,
						additionalProperties: { type: "string" as const },
						description:
							"Key-value pairs for variable substitution in agent messages",
					},
					stream: {
						type: "boolean" as const,
						default: false,
						description: "Whether to stream the response as SSE",
					},
					overrides: {
						type: "object" as const,
						description:
							"Runtime overrides for model, tokens, temperature, etc.",
						properties: {
							model: {
								type: "object" as const,
								properties: {
									provider_id: { type: "string" as const },
									name: { type: "string" as const },
								},
							},
							maxOutputTokens: { type: "number" as const },
							temperature: { type: "number" as const },
							maxStepCount: { type: "number" as const },
							providerOptions: {
								type: "object" as const,
								additionalProperties: true,
							},
						},
					},
					extra_messages: {
						type: "array" as const,
						items: { type: "object" as const, additionalProperties: true },
						description: "Additional messages appended after agent messages",
					},
					extra_tools: {
						type: "array" as const,
						description: "Custom tools to add to the agent",
						items: {
							type: "object" as const,
							required: ["title", "description"],
							properties: {
								title: { type: "string" as const },
								description: { type: "string" as const },
								inputSchema: {
									type: "object" as const,
									additionalProperties: true,
								},
							},
						},
					},
					mcp_options: {
						type: "object" as const,
						additionalProperties: true,
						description: "Per-MCP-server options (e.g. custom headers)",
					},
					metadata: {
						type: "object" as const,
						additionalProperties: { type: "string" as const },
						description:
							"Arbitrary string key-value labels stored on the run for later filtering (e.g. user_id). Max 10 keys; each key and value must be under 128 characters. Inherited by agent-as-tool sub-runs.",
					},
				},
			},
			response: {
				200: {
					description: "Non-streaming response",
					type: "object" as const,
					properties: {
						text: { type: "string" as const },
						messages: {
							type: "array" as const,
							items: { type: "object" as const, additionalProperties: true },
						},
					},
				},
				400: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
				404: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
				403: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
				500: {
					type: "object" as const,
					properties: { message: { type: "string" as const } },
				},
			},
		},
		handler: async (request, reply) => {
			const startTime = Date.now();
			// Generate up front so agents exposed as tools can link their sub-runs
			// back to this run as parent_run_id.
			const runId = nanoid();

			const {
				agent_id,
				environment = "production",
				variables = {},
				stream = false,
				overrides,
				extra_messages,
				extra_tools,
				mcp_options,
				metadata: rawMetadata,
			} = request.body as {
				agent_id: string;
				environment?: "staging" | "production";
				variables?: Record<string, string>;
				stream?: boolean;
				overrides?: RunOverrides;
				extra_messages?: ModelMessage[];
				extra_tools?: {
					title: string;
					description: string;
					inputSchema?: Record<string, unknown>;
				}[];
				mcp_options?: Record<string, { headers?: Record<string, string> }>;
				metadata?: Record<string, string>;
			};

			if (!agent_id) {
				return reply.code(400).send({ message: "agent_id is required" });
			}

			let metadata: Record<string, string> | undefined;
			try {
				metadata = parseRunMetadata(rawMetadata);
			} catch (err) {
				if (err instanceof MetadataError) {
					return reply.code(400).send({ message: err.message });
				}
				throw err;
			}

			// Inline scope check since the required scope depends on body.agent_id.
			if (
				!hasScope(request.principal?.scopes ?? [], `agents:run:${agent_id}`)
			) {
				return reply
					.code(403)
					.send({ message: `Missing required scope: agents:run:${agent_id}` });
			}

			const { workspaceId } = request.params as { workspaceId: string };

			let prepared: Awaited<ReturnType<typeof prepareRun>>;
			try {
				prepared = await prepareRun({
					workspaceId,
					agentId: agent_id,
					environment,
					startTime,
					runId,
					variables,
					overrides,
					extraMessages: extra_messages,
					extraTools: extra_tools,
					mcpOptions: mcp_options,
					metadata,
				});
			} catch (err) {
				if (err instanceof RunPrepError) {
					return reply
						.code(err.code as 400 | 404 | 500)
						.send({ message: err.message });
				}
				throw err;
			}

			const {
				model,
				modelId,
				versionId: preparedVersionId,
				data,
				finalMessages,
				allTools,
				closeAll,
				preProcessingTime,
				runData,
			} = prepared;

			try {
				const {
					maxOutputTokens,
					outputFormat,
					temperature,
					maxStepCount,
					providerOptions,
				} = data;

				if (stream) {
					let streamCompleted = false;

					const controller = new AbortController();

					let firstTokenTime: number | null = null;

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
							// Another terminal callback (onError/onAbort) may have already
							// recorded this run.
							if (streamCompleted) return;
							// A cancelled run (e.g. with in-flight MCP tool calls) can fire
							// both onFinish and onAbort. Don't record it as a success —
							// defer to onAbort so it's deterministically saved as aborted.
							// Returning without setting the guard lets onAbort still run.
							if (controller.signal.aborted) return;
							streamCompleted = true;
							closeAll();

							runData.steps = steps;
							runData.totalUsage = totalUsage;

							await recordRun({
								workspaceId,
								id: runId,
								parentRunId: null,
								metadata,
								versionId: preparedVersionId,
								environment,
								startTime,
								preProcessingTime,
								firstTokenTime: firstTokenTime as number,
								responseTime:
									Date.now() -
									(firstTokenTime || 0) -
									preProcessingTime -
									startTime,
								status: "success",
								isStream: true,
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
									error instanceof Error
										? error.message
										: "Unknown error occured.",
								cause:
									error instanceof Error
										? (error as Error & { cause?: unknown }).cause
										: undefined,
							};

							await recordRun({
								workspaceId,
								id: runId,
								parentRunId: null,
								metadata,
								versionId: preparedVersionId,
								environment,
								startTime,
								preProcessingTime,
								firstTokenTime,
								responseTime:
									Date.now() -
									(firstTokenTime || 0) -
									preProcessingTime -
									startTime,
								status: "error",
								isStream: true,
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
								workspaceId,
								id: runId,
								parentRunId: null,
								metadata,
								versionId: preparedVersionId,
								environment,
								startTime,
								preProcessingTime,
								firstTokenTime,
								responseTime:
									Date.now() -
									(firstTokenTime || 0) -
									preProcessingTime -
									startTime,
								status: "aborted",
								isStream: true,
								modelId,
								usage: totalUsage,
								runData,
							});
						},
					});

					// Abort the AI SDK call when the client disconnects. Under Fastify 5
					// the request-side 'close' event is unreliable during a streamed
					// response — only reply.raw emits 'close' on disconnect. We listen on
					// both as defense-in-depth; the streamCompleted guard prevents
					// double-handling.
					const handleClientClose = () => {
						if (!streamCompleted) {
							controller.abort();
							closeAll();
						}
					};
					reply.raw.on("close", handleClientClose);
					request.raw.on("close", handleClientClose);

					const streamResponse = createSSEStream(result);

					reply.headers({
						"Content-Type": "text/event-stream",
						"Cache-Control": "no-cache",
					});

					return reply.send(streamResponse);
				}

				const controller = new AbortController();
				let completed = false;
				const collectedSteps: StepResult<ToolSet>[] = [];

				// Same pattern as the streaming path — Fastify 5 only fires close on
				// reply.raw for response disconnects. Listen on both for safety.
				const handleClientClose = () => {
					if (!completed) {
						controller.abort();
					}
				};
				reply.raw.on("close", handleClientClose);
				request.raw.on("close", handleClientClose);

				try {
					const result = await generateText({
						model,
						maxOutputTokens,
						temperature,
						stopWhen: stepCountIs(maxStepCount || 10),
						messages: finalMessages,
						tools: allTools as ToolSet,
						output: outputFormat === "json" ? Output.json() : Output.text(),
						providerOptions,
						abortSignal: controller.signal,
						onStepFinish: (step) => {
							collectedSteps.push(step as StepResult<ToolSet>);
						},
					});
					completed = true;

					const { response, text, steps, totalUsage } = result;
					runData.steps = steps;
					runData.totalUsage = totalUsage;

					await recordRun({
						workspaceId,
						id: runId,
						parentRunId: null,
						metadata,
						versionId: preparedVersionId,
						environment,
						startTime,
						preProcessingTime,
						firstTokenTime: Date.now() - preProcessingTime - startTime,
						responseTime: 0,
						status: "success",
						isStream: false,
						modelId,
						usage: totalUsage,
						runData,
					});

					return reply.send({
						text,
						messages: response.messages,
					});
				} catch (error) {
					completed = true;

					if (controller.signal.aborted) {
						// Client disconnected — record as an abort (distinct from error)
						// with partial cost from completed steps. Socket is gone, so don't
						// try to send a reply.
						const totalUsage = sumUsage(collectedSteps);

						runData.steps = collectedSteps;
						runData.totalUsage = totalUsage;
						runData.error = {
							name: "AbortError",
							message: "Run aborted by client disconnect",
						};

						await recordRun({
							workspaceId,
							id: runId,
							parentRunId: null,
							metadata,
							versionId: preparedVersionId,
							environment,
							startTime,
							preProcessingTime,
							firstTokenTime: Date.now() - preProcessingTime - startTime,
							responseTime: 0,
							status: "aborted",
							isStream: false,
							modelId,
							usage: totalUsage,
							runData,
						});
						return;
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
						workspaceId,
						id: runId,
						parentRunId: null,
						metadata,
						versionId: preparedVersionId,
						environment,
						startTime,
						preProcessingTime,
						firstTokenTime: Date.now() - preProcessingTime - startTime,
						responseTime: 0,
						status: "error",
						isStream: false,
						modelId,
						runData,
					});

					return reply.code(500).send(error);
				}
			} finally {
				// Streaming cleanup is handled by the onFinish/onError/close handlers.
				if (!stream) {
					closeAll();
				}
			}
		},
	});
}
