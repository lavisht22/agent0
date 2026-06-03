import {
	generateText,
	type LanguageModel,
	type LanguageModelUsage,
	type ModelMessage,
	Output,
	type StepResult,
	stepCountIs,
	type ToolSet,
} from "ai";
import { nanoid } from "nanoid";
import { cachedQuery } from "./cache.js";
import { calculateModelCost } from "./cost.js";
import { supabase } from "./db.js";
import {
	applyMessageVariables,
	applySkillCatalog,
	prepareMCPServers,
	prepareSkills,
	resolveProviderModel,
	uploadRunData,
} from "./helpers.js";
import type {
	Environment,
	MCPOptions,
	RunData,
	RunOverrides,
	VersionData,
} from "./types.js";

/**
 * Error thrown by `prepareRun` when an agent/version can't be resolved. Carries
 * an HTTP status code so the route handler can map it to a response.
 */
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
	variables?: Record<string, string>;
	overrides?: RunOverrides;
	extraMessages?: ModelMessage[];
	extraTools?: ExtraTool[];
	mcpOptions?: Record<string, MCPOptions>;
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
 * Shared preprocessing for a run: resolve the agent's deployed version for the
 * environment, apply overrides, substitute variables, load the provider model,
 * MCP tools, and skills, and assemble the final message list + tool set.
 *
 * Throws `RunPrepError` (with an HTTP code) when the agent or version can't be
 * resolved. On success the caller owns `closeAll()` — it MUST be invoked once
 * the run finishes to release MCP clients.
 */
export const prepareRun = async (
	opts: PrepareRunOptions,
): Promise<PreparedRun> => {
	const {
		workspaceId,
		agentId,
		environment,
		startTime,
		variables = {},
		overrides,
		extraMessages,
		extraTools,
		mcpOptions,
	} = opts;

	// Get agent with its deployed version IDs, scoped to the authenticated
	// workspace.
	const agent = await cachedQuery(
		`agent:${agentId}:${workspaceId}`,
		30_000, // 30s TTL — short to pick up new deploys quickly
		async () => {
			const { data, error } = await supabase
				.from("agents")
				.select("staging_version_id, production_version_id, workspace_id")
				.eq("id", agentId)
				.eq("workspace_id", workspaceId)
				.single();
			if (error || !data) return null;
			return data;
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

	// Fetch the version data (versions are immutable, cache aggressively)
	const version = await cachedQuery(
		`version:${versionId}`,
		600_000, // 10 min TTL — versions are immutable once created
		async () => {
			const { data, error } = await supabase
				.from("agent_versions")
				.select("*")
				.eq("id", versionId)
				.single();
			if (error || !data) return null;
			return data;
		},
	);

	if (!version) {
		throw new RunPrepError(
			404,
			`No ${environment} version found for this agent`,
		);
	}

	const data = JSON.parse(JSON.stringify(version.data)) as VersionData;

	// Apply runtime overrides if provided
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

	// Merge extra_tools with existing tools
	if (extraTools && extraTools.length > 0) {
		const customTools = extraTools.map((tool) => ({
			type: "custom" as const,
			title: tool.title,
			description: tool.description,
			inputSchema: tool.inputSchema,
		}));
		data.tools = [...(data.tools || []), ...customTools];
	}

	const processedMessages = applyMessageVariables(data, variables);
	const [{ model }, { tools, closeAll }, { systemAddendum, skillTools }] =
		await Promise.all([
			resolveProviderModel(data, environment),
			prepareMCPServers(data, environment, mcpOptions),
			prepareSkills(data),
		]);

	// Inject the skills catalog into the system message (no-op when no skills
	// are attached) before appending any extra messages.
	const messagesWithSkills = applySkillCatalog(
		processedMessages,
		systemAddendum,
	);

	// Append extra messages if provided (used as-is, no variable substitution)
	const finalMessages = extraMessages
		? [...messagesWithSkills, ...extraMessages]
		: messagesWithSkills;

	// Skills win on name collision so the catalog's `read_skill` reference always
	// routes to the built-in handler.
	const allTools = { ...tools, ...skillTools } as ToolSet;

	const runData: RunData = {};
	runData.request = { ...data, messages: finalMessages, overrides };

	const modelId = typeof model === "string" ? model : model.modelId;

	return {
		model,
		modelId,
		versionId,
		data,
		finalMessages,
		allTools,
		closeAll,
		preProcessingTime: Date.now() - startTime,
		runData,
	};
};

export type RecordRunOptions = {
	workspaceId: string;
	versionId: string | null;
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
};

/**
 * Persist a run row and upload its full run data. `tokens`/`cost` are only
 * written when `usage` is provided (errors without any completed step omit
 * them, matching the previous inline behavior). Returns the run id.
 */
export const recordRun = async (opts: RecordRunOptions): Promise<string> => {
	const id = nanoid();
	await supabase.from("runs").insert({
		id,
		workspace_id: opts.workspaceId,
		version_id: opts.versionId,
		created_at: new Date(opts.startTime).toISOString(),
		is_error: opts.isError,
		is_test: opts.isTest ?? false,
		is_stream: opts.isStream,
		pre_processing_time: opts.preProcessingTime,
		first_token_time: opts.firstTokenTime,
		response_time: opts.responseTime,
		...(opts.usage
			? {
					tokens: opts.usage.totalTokens,
					cost: calculateModelCost(opts.modelId, opts.usage),
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
};

export type RunAgentResult = {
	text: string;
	messages: ModelMessage[];
	steps: StepResult<ToolSet>[];
	usage: LanguageModelUsage;
	runId: string;
};

/**
 * Run an agent to completion (non-streaming) and persist the run. This is the
 * reusable in-process entry point — used by internal callers such as the
 * agent-as-tool executor. The HTTP route keeps its own streaming/abort-aware
 * pipeline but shares `prepareRun` and `recordRun`.
 *
 * Propagate `abortSignal` from a parent run so cancelling the parent cancels
 * nested sub-agent calls. Errors are recorded then rethrown.
 */
export const runAgent = async (
	opts: RunAgentOptions,
): Promise<RunAgentResult> => {
	const startTime = opts.startTime ?? Date.now();

	const prepared = await prepareRun({
		workspaceId: opts.workspaceId,
		agentId: opts.agentId,
		environment: opts.environment,
		startTime,
		variables: opts.variables,
		overrides: opts.overrides,
		extraMessages: opts.extraMessages,
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
		});

		const { response, text, steps, totalUsage } = result;
		runData.steps = steps;
		runData.totalUsage = totalUsage;

		const runId = await recordRun({
			workspaceId: opts.workspaceId,
			versionId,
			startTime,
			preProcessingTime,
			firstTokenTime: Date.now() - preProcessingTime - startTime,
			responseTime: 0,
			isError: false,
			isStream: false,
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
			workspaceId: opts.workspaceId,
			versionId,
			startTime,
			preProcessingTime,
			firstTokenTime: Date.now() - preProcessingTime - startTime,
			responseTime: 0,
			isError: true,
			isStream: false,
			modelId,
			runData,
		});

		throw error;
	} finally {
		closeAll();
	}
};
