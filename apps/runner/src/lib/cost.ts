import { MODELS, type ModelCost } from "@repo/models";
import type { LanguageModelUsage } from "ai";

const COSTS = new Map<string, ModelCost>(MODELS.map((m) => [m.id, m.cost]));

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
