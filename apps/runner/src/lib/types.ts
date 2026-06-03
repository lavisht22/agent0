import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import type { OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { XaiProviderOptions } from "@ai-sdk/xai";
import type { LanguageModelUsage, ModelMessage, StepResult, ToolSet } from "ai";

// /**
//  * Provider-specific options for reasoning/thinking configuration.
//  * Each provider has its own format for controlling reasoning behavior.
//  */
export type ProviderOptions = {
	openai?: OpenAIResponsesProviderOptions;
	xai?: XaiProviderOptions;
	google?: GoogleGenerativeAIProviderOptions;
	vertex?: GoogleGenerativeAIProviderOptions;
};

/**
 * A tool from an MCP server.
 */
export type MCPTool = {
	type: "mcp";
	mcp_id: string;
	name: string;
};

/**
 * A custom tool defined by the developer.
 * Custom tools have title, description, and inputSchema but no execute function.
 * The LLM will generate tool calls for these, but execution must be handled externally.
 */
export type CustomTool = {
	type: "custom";
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
};

/**
 * Another agent in the same workspace exposed as a tool. When the model calls
 * it, the runner executes the referenced agent's deployed version in-process
 * (see runAgent) and returns its text output. The model passes a single
 * free-form `prompt` string as the sub-agent's input.
 */
export type AgentTool = {
	type: "agent";
	/** The agent to invoke. Must belong to the same workspace. */
	agent_id: string;
	/** Which deployed version to run. Defaults to "production". */
	environment?: Environment;
	/** Tool name surfaced to the calling model (e.g. "research_assistant"). */
	name: string;
	/** When/why to call this agent — the calling model reasons over this. */
	description: string;
};

/**
 * A tool can be from an MCP server, a custom (client-executed) tool, or another
 * agent exposed as a tool.
 */
export type ToolDefinition = MCPTool | CustomTool | AgentTool;

/**
 * A skill embedded inside the agent version. Versioned along with the rest
 * of the agent's config — no separate table.
 */
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
