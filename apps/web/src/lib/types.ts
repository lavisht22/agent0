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
	/**
	 * The full assistant transcript. Written by runners on AI SDK 7+, where
	 * `steps[last].response.messages` stopped accumulating across steps. Absent
	 * on runs recorded before that, which fall back to the old shape.
	 */
	responseMessages?: MessageT[];
	totalUsage?: LanguageModelUsage;
	/** Per-step price breakdown behind the run's cost (runner's RunCost). */
	cost?: RunCostBreakdown;
	error?: {
		name: string;
		message: string;
		cause?: unknown;
	};
};

export type CostLineKind =
	| "input"
	| "audioInput"
	| "toolUseInput"
	| "cacheRead"
	| "audioCacheRead"
	| "cacheWrite5m"
	| "cacheWrite1h"
	| "output";

export type RunCostBreakdown = {
	total: number | null;
	estimateReasons: string[];
	steps: {
		cost: number;
		source: "rates" | "provider";
		tier: string;
		longContext: boolean;
		regional: boolean;
		// USD per 1M tokens, after tier, long-context and regional adjustments.
		lines: { kind: CostLineKind; tokens: number; rate: number; cost: number }[];
	}[];
};
