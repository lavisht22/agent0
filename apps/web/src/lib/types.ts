import type { LanguageModelUsage, StepResult, ToolSet } from "ai";
import type { MessageT } from "@/components/messages";

export type MCPTool = {
	type: "mcp";
	mcp_id: string;
	name: string;
};

export type CustomTool = {
	type: "custom";
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
};

// Another agent in the same workspace exposed as a tool; the runner executes its
// deployed version and returns the text.
export type AgentTool = {
	type: "agent";
	agent_id: string;
	name: string;
	description: string;
};

export type RunData = {
	request?: {
		model: { provider_id: string; name: string };
		messages: MessageT[];
		maxOutputTokens?: number;
		outputFormat?: "text" | "json";
		temperature?: number;
		maxStepCount?: number;
		tools?: (MCPTool | CustomTool | AgentTool)[];
		providerOptions?: Record<string, unknown>;
	};
	steps?: StepResult<ToolSet>[];
	totalUsage?: LanguageModelUsage;
	error?: {
		name: string;
		message: string;
		cause?: unknown;
	};
};
