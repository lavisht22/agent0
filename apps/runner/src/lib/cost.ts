import { MODELS, type ModelCost } from "@repo/models";
import type { LanguageModelUsage } from "ai";

const COSTS = new Map<string, ModelCost>(MODELS.map((m) => [m.id, m.cost]));

export const sumUsage = (
	steps: ReadonlyArray<{ usage: LanguageModelUsage }>,
): LanguageModelUsage => {
	let inputTokens = 0;
	let outputTokens = 0;
	let totalTokens = 0;
	let noCacheTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;
	let textTokens = 0;
	let reasoningTokens = 0;

	for (const step of steps) {
		const u = step.usage;
		inputTokens += u.inputTokens || 0;
		outputTokens += u.outputTokens || 0;
		totalTokens += u.totalTokens || 0;
		noCacheTokens += u.inputTokenDetails?.noCacheTokens || 0;
		cacheReadTokens += u.inputTokenDetails?.cacheReadTokens || 0;
		cacheWriteTokens += u.inputTokenDetails?.cacheWriteTokens || 0;
		textTokens += u.outputTokenDetails?.textTokens || 0;
		reasoningTokens += u.outputTokenDetails?.reasoningTokens || 0;
	}

	return {
		inputTokens,
		inputTokenDetails: { noCacheTokens, cacheReadTokens, cacheWriteTokens },
		outputTokens,
		outputTokenDetails: { textTokens, reasoningTokens },
		totalTokens,
	};
};

export const calculateModelCost = (
	model: string,
	usage: LanguageModelUsage,
) => {
	const cost = COSTS.get(model);

	if (!cost) {
		return null;
	}

	const noCacheInputCost =
		(usage.inputTokenDetails?.noCacheTokens || 0) *
		(cost.noCacheInput / 1000000);

	const cacheInputCost =
		(usage.inputTokenDetails?.cacheReadTokens || 0) *
		(cost.cacheInput / 1000000);

	const outputCost = (usage.outputTokens || 0) * (cost.output / 1000000);

	return noCacheInputCost + cacheInputCost + outputCost;
};
