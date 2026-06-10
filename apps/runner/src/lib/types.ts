import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { LanguageModelUsage, ModelMessage, StepResult, ToolSet } from "ai";

export type ProviderOptions = {
	openai?: OpenAIResponsesProviderOptions;
	xai?: XaiProviderOptions;
	google?: GoogleGenerativeAIProviderOptions;
	vertex?: GoogleGenerativeAIProviderOptions;
};

export type MCPTool = {
	type: "mcp";
	mcp_id: string;
	name: string;
};

/** Client-executed tool: the LLM emits calls, execution happens externally. */
export type CustomTool = {
	type: "custom";
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
};

/**
 * Another agent in the same workspace exposed as a tool. The runner executes the
 * referenced agent's deployed version in-process (see runAgent), passing a single
 * free-form `prompt` string as input, and returns its text output.
 */
export type AgentTool = {
	type: "agent";
	agent_id: string;
	name: string;
	description: string;
};

export type ToolDefinition = MCPTool | CustomTool | AgentTool;

/** Embedded in the agent version (versioned with it; no separate table). */
export type Skill = {
	id: string;
	name: string;
	description: string;
	body: string;
};

export type VersionData = {
	model: { provider_id: string; name: string };
	messages: ModelMessage[];
	maxOutputTokens?: number;
	outputFormat?: "text" | "json";
	temperature?: number;
	maxStepCount?: number;
	tools?: ToolDefinition[];
	skills?: Skill[];
	providerOptions?: ProviderOptions;
};

export type RunOverrides = {
	model?: {
		provider_id?: string;
		name?: string;
	};
	maxOutputTokens?: number;
	temperature?: number;
	maxStepCount?: number;
	providerOptions?: ProviderOptions;
};

export type RunData = {
	request?: VersionData & {
		overrides?: RunOverrides;
	};
	steps?: StepResult<ToolSet>[];
	error?: {
		name: string;
		message: string;
		cause?: unknown;
	};
	totalUsage?: LanguageModelUsage;
};

export type MCPConfig = {
	transport: {
		type: "sse" | "http";
		url: string;
		headers?: Record<string, string>;
	};
};

export type MCPOptions = {
	headers?: Record<string, string>;
};

export type Environment = "staging" | "production";
