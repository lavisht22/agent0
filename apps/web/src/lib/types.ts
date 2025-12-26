import type { StepResult, ToolSet } from "ai";
import type { MessageT } from "@/components/messages";

/**
 * MCP Tool - tool from an MCP server
 */
export type MCPTool = {
	type: "mcp";
	mcp_id: string;
	name: string;
};

/**
 * Custom Tool - defined inline by the developer
 */
export type CustomTool = {
	type: "custom";
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
};

export type RunData = {
	request?: {
		model: { provider_id: string; name: string };
		messages: MessageT[];
		maxOutputTokens?: number;
		outputFormat?: "text" | "json";
		temperature?: number;
		maxStepCount?: number;
		tools?: (MCPTool | CustomTool)[];
		providerOptions?: Record<string, unknown>;
	};
	steps?: StepResult<ToolSet>[];
	error?: {
		name: string;
		message: string;
		cause?: unknown;
	};
};
