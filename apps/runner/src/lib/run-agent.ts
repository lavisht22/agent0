import { agents, agentVersions, runs } from "@repo/database";
import {
	generateText,
	jsonSchema,
	type LanguageModel,
	type LanguageModelUsage,
	type ModelMessage,
	Output,
	type StepResult,
	stepCountIs,
	type Tool,
	type ToolSet,
} from "ai";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cachedQuery } from "./cache.js";
import { calculateModelCost, sumUsage } from "./cost.js";
import {
	applyMessageVariables,
	applySkillCatalog,
	prepareMCPServers,
	prepareSkills,
	resolveProviderModel,
	uploadRunData,
} from "./helpers.js";
import { db } from "./pg.js";
import type {
	AgentTool,
	Environment,
	MCPOptions,
	RunData,
	RunOverrides,
	VersionData,
} from "./types.js";

const MAX_AGENT_DEPTH = 5;

export const buildAgentTools = (
	agentTools: AgentTool[],
	workspaceId: string,
	// Agent IDs currently on the execution stack, including the agent that owns
	// these tools. Guards cycles (A → B → A) and bounds depth.
	activeChain: string[],
	parentRunId: string,
	environment: Environment,
	isTest: boolean,
	mcpOptions?: Record<string, MCPOptions>,
): ToolSet => {
	const toolSet: ToolSet = {};

	for (const agentTool of agentTools) {
		const tool: Tool = {
			description: agentTool.description,
			inputSchema: jsonSchema({
				type: "object",
				properties: {
					prompt: {
						type: "string",
						description: "The request to send to this agent.",
					},
				},
				required: ["prompt"],
			}),
			execute: async (input, { abortSignal }) => {
				if (activeChain.includes(agentTool.agent_id)) {
					return `Error: agent "${agentTool.name}" is already running in this call chain; refusing to call it recursively.`;
				}
				if (activeChain.length >= MAX_AGENT_DEPTH) {
					return `Error: maximum agent call depth (${MAX_AGENT_DEPTH}) reached; cannot call "${agentTool.name}".`;
				}

				const prompt = (input as { prompt?: string })?.prompt ?? "";

				try {
					const result = await runAgent({
						workspaceId,
						agentId: agentTool.agent_id,
						environment,
						extraMessages: [
							{ role: "user", content: [{ type: "text", text: prompt }] },
						],
						abortSignal,
						callStack: activeChain,
						parentRunId,
						isTest,
						mcpOptions,
					});
					return result.text;
				} catch (err) {
					return `Error running agent "${agentTool.name}": ${
						err instanceof Error ? err.message : "unknown error"
					}`;
				}
			},
		};

		toolSet[agentTool.name] = tool;
	}

	return toolSet;
};

export class RunPrepError extends Error {
	code: number;
	constructor(code: number, message: string) {
		super(message);
		this.name = "RunPrepError";
		this.code = code;
	}
}

type ExtraTool = {
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
};

export type PrepareRunOptions = {
	workspaceId: string;
	agentId: string;
	environment: Environment;
	startTime: number;
	runId: string;
	variables?: Record<string, string>;
	overrides?: RunOverrides;
	extraMessages?: ModelMessage[];
	extraTools?: ExtraTool[];
	mcpOptions?: Record<string, MCPOptions>;
	callStack?: string[];
	isTest?: boolean;
};

export type PreparedRun = {
	model: LanguageModel;
	modelId: string;
	versionId: string;
	data: VersionData;
	finalMessages: ModelMessage[];
	allTools: ToolSet;
	closeAll: () => void;
	preProcessingTime: number;
	runData: RunData;
};

/**
 * On success the caller owns `closeAll()` — it MUST be invoked once the run
 * finishes to release MCP clients.
 */
export const prepareRun = async (
	opts: PrepareRunOptions,
): Promise<PreparedRun> => {
	const {
		workspaceId,
		agentId,
		environment,
		startTime,
		runId,
		variables = {},
		overrides,
		extraMessages,
		extraTools,
		mcpOptions,
		callStack = [],
		isTest = false,
	} = opts;

	const agent = await cachedQuery(
		`agent:${agentId}:${workspaceId}`,
		30_000, // short TTL to pick up new deploys quickly
		async () => {
			const [row] = await db
				.select({
					staging_version_id: agents.staging_version_id,
					production_version_id: agents.production_version_id,
					workspace_id: agents.workspace_id,
				})
				.from(agents)
				.where(
					and(eq(agents.id, agentId), eq(agents.workspace_id, workspaceId)),
				)
				.limit(1);
			return row ?? null;
		},
	);

	if (!agent) {
		throw new RunPrepError(404, "Agent not found");
	}

	const versionId =
		environment === "staging"
			? agent.staging_version_id
			: agent.production_version_id;

	if (!versionId) {
		throw new RunPrepError(
			404,
			`No ${environment} version found for this agent`,
		);
	}

	const version = await cachedQuery(
		`version:${versionId}`,
		600_000, // 10 min TTL — versions are immutable once created
		async () => {
			const [row] = await db
				.select()
				.from(agentVersions)
				.where(eq(agentVersions.id, versionId))
				.limit(1);
			return row ?? null;
		},
	);

	if (!version) {
		throw new RunPrepError(
			404,
			`No ${environment} version found for this agent`,
		);
	}

	const data = JSON.parse(JSON.stringify(version.data)) as VersionData;

	if (overrides) {
		if (overrides.model?.provider_id)
			data.model.provider_id = overrides.model.provider_id;
		if (overrides.model?.name) data.model.name = overrides.model.name;
		if (overrides.maxOutputTokens !== undefined)
			data.maxOutputTokens = overrides.maxOutputTokens;
		if (overrides.temperature !== undefined)
			data.temperature = overrides.temperature;
		if (overrides.maxStepCount !== undefined)
			data.maxStepCount = overrides.maxStepCount;
		if (overrides.providerOptions)
			data.providerOptions = {
				...data.providerOptions,
				...overrides.providerOptions,
			};
	}

	if (extraTools && extraTools.length > 0) {
		const customTools = extraTools.map((tool) => ({
			type: "custom" as const,
			title: tool.title,
			description: tool.description,
			inputSchema: tool.inputSchema,
		}));
		data.tools = [...(data.tools || []), ...customTools];
	}

	const assembled = await assembleRun(data, {
		workspaceId,
		environment,
		runId,
		agentId,
		variables,
		extraMessages,
		mcpOptions,
		callStack,
		isTest,
	});

	if (overrides && assembled.runData.request) {
		assembled.runData.request.overrides = overrides;
	}

	return {
		...assembled,
		versionId,
		preProcessingTime: Date.now() - startTime,
	};
};

export type AssembleRunOptions = {
	workspaceId: string;
	environment: Environment;
	runId: string;
	agentId?: string;
	variables?: Record<string, string>;
	extraMessages?: ModelMessage[];
	mcpOptions?: Record<string, MCPOptions>;
	callStack?: string[];
	isTest?: boolean;
};

export type AssembledRun = {
	model: LanguageModel;
	modelId: string;
	data: VersionData;
	finalMessages: ModelMessage[];
	allTools: ToolSet;
	closeAll: () => void;
	runData: RunData;
};

/**
 * Pure of any DB lookup of the agent/version, so it's shared by both the
 * saved-version path (prepareRun) and the editor test path (unsaved draft data).
 * The caller owns `closeAll()` — it MUST be invoked once the run finishes.
 */
export const assembleRun = async (
	data: VersionData,
	opts: AssembleRunOptions,
): Promise<AssembledRun> => {
	const {
		workspaceId,
		environment,
		runId,
		agentId,
		variables = {},
		extraMessages,
		mcpOptions,
		callStack = [],
		isTest = false,
	} = opts;

	const processedMessages = applyMessageVariables(data, variables);
	const [{ model }, { tools, closeAll }, { systemAddendum, skillTools }] =
		await Promise.all([
			resolveProviderModel(data, environment),
			prepareMCPServers(data, environment, mcpOptions),
			prepareSkills(data),
		]);

	const messagesWithSkills = applySkillCatalog(
		processedMessages,
		systemAddendum,
	);

	// extra messages are appended as-is (no variable substitution)
	const finalMessages = extraMessages
		? [...messagesWithSkills, ...extraMessages]
		: messagesWithSkills;

	// Include this run's own agent in the active chain so a sub-agent can detect
	// a cycle back to it.
	const activeChain = agentId ? [...callStack, agentId] : [...callStack];
	const agentToolDefs = (data.tools ?? []).filter(
		(t): t is AgentTool => "type" in t && t.type === "agent",
	);
	const agentTools = buildAgentTools(
		agentToolDefs,
		workspaceId,
		activeChain,
		runId,
		environment,
		isTest,
		mcpOptions,
	);

	// Skills win on name collision so the catalog's `read_skill` reference always
	// routes to the built-in handler.
	const allTools = { ...tools, ...agentTools, ...skillTools } as ToolSet;

	const runData: RunData = {};
	runData.request = { ...data, messages: finalMessages };

	const modelId = typeof model === "string" ? model : model.modelId;

	return {
		model,
		modelId,
		data,
		finalMessages,
		allTools,
		closeAll,
		runData,
	};
};

export type RecordRunOptions = {
	workspaceId: string;
	versionId: string | null;
	environment: Environment;
	startTime: number;
	preProcessingTime: number;
	firstTokenTime: number;
	responseTime: number;
	isError: boolean;
	isStream: boolean;
	isTest?: boolean;
	modelId: string;
	usage?: LanguageModelUsage;
	runData: RunData;
	id?: string;
	parentRunId?: string | null;
};

export const recordRun = async (opts: RecordRunOptions): Promise<string> => {
	const id = opts.id ?? nanoid();
	// `numeric` columns are string-typed in the schema (see D12); stringify the
	// numeric run metrics at the insert boundary.
	await db.insert(runs).values({
		id,
		workspace_id: opts.workspaceId,
		version_id: opts.versionId,
		environment: opts.environment,
		parent_run_id: opts.parentRunId ?? null,
		created_at: new Date(opts.startTime).toISOString(),
		is_error: opts.isError,
		is_test: opts.isTest ?? false,
		is_stream: opts.isStream,
		pre_processing_time: String(opts.preProcessingTime),
		first_token_time: String(opts.firstTokenTime),
		response_time: String(opts.responseTime),
		...(opts.usage
			? {
					tokens: String(opts.usage.totalTokens),
					cost: String(calculateModelCost(opts.modelId, opts.usage)),
				}
			: {}),
	});
	await uploadRunData(id, opts.runData);
	return id;
};

export type RunAgentOptions = {
	workspaceId: string;
	agentId: string;
	environment: Environment;
	variables?: Record<string, string>;
	extraMessages?: ModelMessage[];
	overrides?: RunOverrides;
	abortSignal?: AbortSignal;
	startTime?: number;
	callStack?: string[];
	parentRunId?: string | null;
	isTest?: boolean;
	mcpOptions?: Record<string, MCPOptions>;
};

export type RunAgentResult = {
	text: string;
	messages: ModelMessage[];
	steps: StepResult<ToolSet>[];
	usage: LanguageModelUsage;
	runId: string;
};

/**
 * Run an agent to completion (non-streaming) and persist the run. The in-process
 * entry point used by the agent-as-tool executor; the HTTP route keeps its own
 * streaming/abort-aware pipeline but shares `prepareRun` and `recordRun`.
 */
export const runAgent = async (
	opts: RunAgentOptions,
): Promise<RunAgentResult> => {
	const startTime = opts.startTime ?? Date.now();
	const runId = nanoid();

	const prepared = await prepareRun({
		workspaceId: opts.workspaceId,
		agentId: opts.agentId,
		environment: opts.environment,
		startTime,
		runId,
		variables: opts.variables,
		overrides: opts.overrides,
		extraMessages: opts.extraMessages,
		callStack: opts.callStack,
		isTest: opts.isTest,
		mcpOptions: opts.mcpOptions,
	});

	const {
		model,
		modelId,
		versionId,
		data,
		finalMessages,
		allTools,
		closeAll,
		preProcessingTime,
		runData,
	} = prepared;

	// Collected for partial cost attribution if the run is aborted mid-flight.
	const collectedSteps: StepResult<ToolSet>[] = [];

	try {
		const result = await generateText({
			model,
			maxOutputTokens: data.maxOutputTokens,
			temperature: data.temperature,
			stopWhen: stepCountIs(data.maxStepCount || 10),
			messages: finalMessages,
			tools: allTools,
			output: data.outputFormat === "json" ? Output.json() : Output.text(),
			providerOptions: data.providerOptions,
			abortSignal: opts.abortSignal,
			onStepFinish: (step) => {
				collectedSteps.push(step as StepResult<ToolSet>);
			},
		});

		const { response, text, steps, totalUsage } = result;
		runData.steps = steps;
		runData.totalUsage = totalUsage;

		await recordRun({
			id: runId,
			parentRunId: opts.parentRunId,
			workspaceId: opts.workspaceId,
			versionId,
			environment: opts.environment,
			startTime,
			preProcessingTime,
			firstTokenTime: Date.now() - preProcessingTime - startTime,
			responseTime: 0,
			isError: false,
			isStream: false,
			isTest: opts.isTest,
			modelId,
			usage: totalUsage,
			runData,
		});

		return {
			text,
			messages: response.messages,
			steps,
			usage: totalUsage,
			runId,
		};
	} catch (error) {
		// A parent cancellation aborts the shared signal; record it as an abort
		// (with partial usage from completed steps) rather than a generic error.
		const aborted = opts.abortSignal?.aborted ?? false;
		const totalUsage = sumUsage(collectedSteps);
		runData.steps = collectedSteps;
		runData.totalUsage = totalUsage;
		runData.error = aborted
			? { name: "AbortError", message: "Run aborted by parent run" }
			: {
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
			parentRunId: opts.parentRunId,
			workspaceId: opts.workspaceId,
			versionId,
			environment: opts.environment,
			startTime,
			preProcessingTime,
			firstTokenTime: Date.now() - preProcessingTime - startTime,
			responseTime: 0,
			isError: true,
			isStream: false,
			isTest: opts.isTest,
			modelId,
			usage: collectedSteps.length > 0 ? totalUsage : undefined,
			runData,
		});

		throw error;
	} finally {
		closeAll();
	}
};
