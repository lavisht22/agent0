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
 * A tool can either be from an MCP server or a custom tool.
 */
export type ToolDefinition = MCPTool | CustomTool;

export type VersionData = {
	model: { provider_id: string; name: string };
	messages: ModelMessage[];
	maxOutputTokens?: number;
	outputFormat?: "text" | "json";
	temperature?: number;
	maxStepCount?: number;
	tools?: ToolDefinition[];
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
