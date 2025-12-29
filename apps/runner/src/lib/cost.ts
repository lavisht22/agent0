import type { LanguageModelUsage } from "ai";

const MODEL_COSTS: {
	[key: string]: { noCacheInput: number; cacheInput: number; output: number };
} = {
	// GPT-5 Series
	"gpt-5.2": {
		noCacheInput: 1.75,
		cacheInput: 0.175,
		output: 14,
	},
	"gpt-5.1": {
		noCacheInput: 1.25,
		cacheInput: 0.125,
		output: 10,
	},
	"gpt-5": {
		noCacheInput: 1.25,
		cacheInput: 0.125,
		output: 10,
	},
	"gpt-5-mini": {
		noCacheInput: 0.25,
		cacheInput: 0.025,
		output: 2,
	},
	"gpt-5-nano": {
		noCacheInput: 0.05,
		cacheInput: 0.005,
		output: 0.4,
	},
	"gpt-5.2-chat-latest": {
		noCacheInput: 1.75,
		cacheInput: 0.175,
		output: 14,
	},
	"gpt-5.1-chat-latest": {
		noCacheInput: 1.25,
		cacheInput: 0.125,
		output: 10,
	},
	"gpt-5-chat-latest": {
		noCacheInput: 1.25,
		cacheInput: 0.125,
		output: 10,
	},
	"gpt-5.2-pro": {
		noCacheInput: 21,
		cacheInput: 21,
		output: 168,
	},
	"gpt-5-pro": {
		noCacheInput: 15,
		cacheInput: 15,
		output: 120,
	},

	// GPT-4 Series
	"gpt-4.1": {
		noCacheInput: 2,
		cacheInput: 0.5,
		output: 8,
	},
	"gpt-4.1-mini": {
		noCacheInput: 0.4,
		cacheInput: 0.1,
		output: 1.6,
	},
	"gpt-4.1-nano": {
		noCacheInput: 0.1,
		cacheInput: 0.025,
		output: 0.4,
	},

	// O-Series Models
	"o4-mini": {
		noCacheInput: 1.1,
		cacheInput: 0.275,
		output: 4.4,
	},

	// Grok 4.1
	"grok-4-1-fast-reasoning": {
		noCacheInput: 0.2,
		cacheInput: 0.05,
		output: 0.5,
	},
	"grok-4-1-fast-non-reasoning": {
		noCacheInput: 0.2,
		cacheInput: 0.05,
		output: 0.5,
	},

	// Grok 4.
	"grok-4-fast-reasoning": {
		noCacheInput: 0.2,
		cacheInput: 0.05,
		output: 0.5,
	},
	"grok-4-fast-non-reasoning": {
		noCacheInput: 0.2,
		cacheInput: 0.05,
		output: 0.5,
	},

	// Gemini 3
	"gemini-3-pro-preview": {
		noCacheInput: 2,
		cacheInput: 0.2,
		output: 12,
	},
	"gemini-3-flash-preview": {
		noCacheInput: 0.5,
		cacheInput: 0.05,
		output: 1,
	},

	// Gemini 2.5
	"gemini-2.5-pro": {
		noCacheInput: 1.25,
		cacheInput: 0.125,
		output: 10,
	},
	"gemini-2.5-flash": {
		noCacheInput: 0.3,
		cacheInput: 0.03,
		output: 1,
	},

	// Bedrock Claude
	"global.anthropic.claude-opus-4-5-20251101-v1:0": {
		noCacheInput: 5,
		cacheInput: 0.5,
		output: 25,
	},
	"global.anthropic.claude-haiku-4-5-20251001-v1:0": {
		noCacheInput: 1,
		cacheInput: 0.1,
		output: 5,
	},
	"global.anthropic.claude-sonnet-4-5-20250929-v1:0": {
		noCacheInput: 3,
		cacheInput: 0.3,
		output: 15,
	},
};

export const calculateModelCost = (
	model: string,
	usage: LanguageModelUsage,
) => {
	const COST = MODEL_COSTS[model];

	if (!COST) {
		return null;
	}

	const noCacheInputCost =
		(usage.inputTokenDetails?.noCacheTokens || 0) *
		(COST.noCacheInput / 1000000);

	const cacheInputCost =
		(usage.inputTokenDetails?.cacheReadTokens || 0) *
		(COST.cacheInput / 1000000);

	const outputCost = (usage.outputTokens || 0) * (COST.output / 1000000);

	return noCacheInputCost + cacheInputCost + outputCost;
};
