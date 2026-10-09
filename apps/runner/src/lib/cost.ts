import {
	costAt,
	MODELS,
	type ModelCost,
	type ProviderModel,
	type RateSheet,
	type ServiceTier,
} from "@repo/models";
import type { LanguageModelUsage } from "ai";

const CATALOG = new Map(MODELS.map((m) => [m.id, m]));

/**
 * What a run is priced against: the model's rates plus the facts about the
 * request that change them but aren't visible in a response.
 */
export type Pricing = {
	cost: ModelCost;
	// A price the workspace entered on the provider. Taken as the price they pay
	// at the endpoint they use, so no regional uplift is applied on top.
	custom: boolean;
	// Served from a regional (non-global) endpoint.
	regional: boolean;
};

// Bedrock cross-region inference profiles. `global.` is billed at the base
// price; the geo profiles and a bare in-region `anthropic.` id cost more.
const BEDROCK_GEO_PREFIX = /^(?:us|eu|jp|au|apac|in|us-gov)\./;

/**
 * Resolve how a model is priced. A provider serving a custom catalog prices its
 * own models; everything else comes from the built-in catalog at the price in
 * effect at `at`. Null when neither knows the model.
 */
export const resolvePricing = (opts: {
	providerType: string;
	modelId: string;
	// The provider config's `location` (Vertex providers).
	location?: string;
	customModels?: ProviderModel[] | null;
	at?: Date;
}): Pricing | null => {
	const custom = opts.customModels?.find((m) => m.id === opts.modelId);
	if (custom) {
		return { cost: custom.cost, custom: true, regional: false };
	}

	let catalogId = opts.modelId;
	let regional = false;

	if (opts.providerType === "bedrock") {
		// The catalog lists the global profile; a geo profile or in-region id is
		// the same model at the regional rate.
		if (BEDROCK_GEO_PREFIX.test(catalogId)) {
			catalogId = `global.${catalogId.replace(BEDROCK_GEO_PREFIX, "")}`;
			regional = true;
		} else if (catalogId.startsWith("anthropic.")) {
			catalogId = `global.${catalogId}`;
			regional = true;
		}
	}

	if (
		opts.providerType === "anthropic-vertex" ||
		opts.providerType === "google-vertex"
	) {
		// Mirrors the SDK: the provider config wins over the environment.
		const location = opts.location ?? process.env.GOOGLE_VERTEX_LOCATION;
		regional = location !== undefined && location !== "global";
	}

	const model = CATALOG.get(catalogId);
	if (!model) return null;

	return {
		cost: costAt(model, opts.at ?? new Date()),
		custom: false,
		regional,
	};
};

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

export type CostLineKind =
	| "input"
	| "audioInput"
	| "toolUseInput"
	| "cacheRead"
	| "audioCacheRead"
	| "cacheWrite5m"
	| "cacheWrite1h"
	| "output";

export type CostLine = {
	kind: CostLineKind;
	tokens: number;
	// USD per 1M tokens, after tier, long-context and regional adjustments.
	rate: number;
	cost: number;
};

export type StepCost = {
	cost: number;
	// "provider": the provider reported the billed amount itself (xAI).
	source: "rates" | "provider";
	tier: "standard" | ServiceTier | "provisioned" | "unknown";
	longContext: boolean;
	regional: boolean;
	lines: CostLine[];
};

export type RunCost = {
	// Null when the model has no price and the provider reported none.
	total: number | null;
	// Why `total` may differ from the bill. Empty when it is exact.
	estimateReasons: string[];
	steps: StepCost[];
};

// The slice of a stored step this module reads.
export type PricedStep = {
	usage: LanguageModelUsage;
	providerMetadata?: Record<string, Record<string, unknown> | undefined>;
};

type Raw = Record<string, unknown> | undefined;

const num = (v: unknown): number => (typeof v === "number" && v > 0 ? v : 0);

const modalityCount = (details: unknown, modality: string): number => {
	if (!Array.isArray(details)) return 0;
	let total = 0;
	for (const d of details) {
		if (d && typeof d === "object" && d.modality === modality) {
			total += num(d.tokenCount);
		}
	}
	return total;
};

/**
 * 1-hour cache writes, from Anthropic's `cache_creation` split (Vertex) or
 * Bedrock's `cacheDetails`. Anything not reported as 1h is a 5-minute write,
 * which is also the TTL our breakpoints request.
 */
const oneHourWrites = (raw: Raw): number => {
	const anthropic = raw?.cache_creation as Raw;
	if (anthropic) return num(anthropic.ephemeral_1h_input_tokens);

	const details = raw?.cacheDetails;
	if (Array.isArray(details)) {
		let total = 0;
		for (const d of details) {
			if (d && typeof d === "object" && d.ttl === "1h") {
				total += num(d.inputTokens);
			}
		}
		return total;
	}
	return 0;
};

/** The service tier the provider says served the request, if it says. */
const reportedTier = (step: PricedStep): string | undefined => {
	// OpenAI and Azure (keyed by provider name) and Bedrock surface it in
	// provider metadata; Bedrock as `{ type }`.
	for (const meta of Object.values(step.providerMetadata ?? {})) {
		const tier = meta?.serviceTier;
		if (typeof tier === "string") return tier;
		if (tier && typeof tier === "object" && "type" in tier) {
			const type = (tier as { type: unknown }).type;
			if (typeof type === "string") return type;
		}
	}
	// Gemini API reports `serviceTier`, Vertex `trafficType`, Anthropic
	// `service_tier`, all on the raw usage object.
	const raw = step.usage.raw as Raw;
	for (const key of ["trafficType", "serviceTier", "service_tier"]) {
		const tier = raw?.[key];
		if (typeof tier === "string") return tier;
	}
	return undefined;
};

const normalizeTier = (tier: string | undefined): StepCost["tier"] => {
	if (tier === undefined) return "standard";
	switch (tier.toLowerCase()) {
		case "default":
		case "standard":
		case "standard_only":
		case "auto":
		case "on_demand":
			return "standard";
		case "priority":
		case "fast":
		case "on_demand_priority":
			return "priority";
		case "flex":
		case "on_demand_flex":
			return "flex";
		case "ultrafast":
			return "ultrafast";
		case "provisioned_throughput":
		case "reserved":
			return "provisioned";
		default:
			return "unknown";
	}
};

const scaleSheet = (sheet: RateSheet, k: number): RateSheet => ({
	noCacheInput: sheet.noCacheInput * k,
	cacheInput: sheet.cacheInput * k,
	output: sheet.output * k,
	cacheWriteInput:
		sheet.cacheWriteInput === undefined ? undefined : sheet.cacheWriteInput * k,
	cacheWriteInput1h:
		sheet.cacheWriteInput1h === undefined
			? undefined
			: sheet.cacheWriteInput1h * k,
	audioInput: sheet.audioInput === undefined ? undefined : sheet.audioInput * k,
	audioCacheInput:
		sheet.audioCacheInput === undefined ? undefined : sheet.audioCacheInput * k,
});

// Field-by-field `sheet * (to / from)`: carries a long-context premium over to
// a tier whose long-context rates aren't published.
const ratioSheet = (
	sheet: RateSheet,
	from: RateSheet,
	to: RateSheet,
): RateSheet => {
	const r = (a: number | undefined, f: number | undefined, t?: number) =>
		a === undefined ? undefined : f && t !== undefined ? a * (t / f) : a;
	return {
		noCacheInput:
			r(sheet.noCacheInput, from.noCacheInput, to.noCacheInput) ?? 0,
		cacheInput: r(sheet.cacheInput, from.cacheInput, to.cacheInput) ?? 0,
		output: r(sheet.output, from.output, to.output) ?? 0,
		cacheWriteInput: r(
			sheet.cacheWriteInput,
			from.cacheWriteInput,
			to.cacheWriteInput,
		),
		cacheWriteInput1h: r(
			sheet.cacheWriteInput1h,
			from.cacheWriteInput1h,
			to.cacheWriteInput1h,
		),
		audioInput: r(sheet.audioInput, from.audioInput, to.audioInput),
		audioCacheInput: r(
			sheet.audioCacheInput,
			from.audioCacheInput,
			to.audioCacheInput,
		),
	};
};

/** Price one model call from the usage and metadata its response carried. */
export const priceStep = (
	step: PricedStep,
	pricing: Pricing | null,
	notes: Set<string>,
): StepCost | null => {
	const usage = step.usage;
	const raw = usage.raw as Raw;
	const tier = normalizeTier(reportedTier(step));

	// xAI reports what it billed (after cache discounts, tier and tool fees) in
	// ticks of 1e-10 USD; nothing computed here can be more exact.
	for (const meta of Object.values(step.providerMetadata ?? {})) {
		const ticks = meta?.costInUsdTicks;
		if (typeof ticks === "number") {
			return {
				cost: ticks / 1e10,
				source: "provider",
				tier,
				longContext: false,
				regional: false,
				lines: [],
			};
		}
	}

	if (!pricing) return null;

	// The SDK splits input into three disjoint parts for every provider in use;
	// derive the uncached part if a provider leaves it out.
	const cacheRead = num(usage.inputTokenDetails?.cacheReadTokens);
	const cacheWrite = num(usage.inputTokenDetails?.cacheWriteTokens);
	const inputTotal = num(usage.inputTokens);
	const noCache =
		usage.inputTokenDetails?.noCacheTokens ??
		Math.max(0, inputTotal - cacheRead - cacheWrite);
	const output = num(usage.outputTokens);

	const write1h = Math.min(oneHourWrites(raw), cacheWrite);
	const write5m = cacheWrite - write1h;

	// Gemini reports audio per modality; cached audio is a subset of the cache.
	const cachedAudio = Math.min(
		modalityCount(raw?.cacheTokensDetails, "AUDIO"),
		cacheRead,
	);
	const uncachedAudio = Math.min(
		Math.max(0, modalityCount(raw?.promptTokensDetails, "AUDIO") - cachedAudio),
		noCache,
	);
	// Tool results (code execution, URL context) that Gemini bills as input but
	// the SDK leaves out of inputTokens.
	const toolUseInput = num(raw?.toolUsePromptTokenCount);

	const { cost } = pricing;
	const lc = cost.longContext;
	const longContext = lc !== undefined && inputTotal > lc.threshold;

	let sheet: RateSheet = longContext ? lc : cost;

	if (tier === "provisioned") {
		notes.add(
			"Served by provisioned or reserved capacity, which is billed by subscription; priced at on-demand rates",
		);
	} else if (tier === "unknown") {
		notes.add(
			`Served on the "${reportedTier(step)}" service tier, which has no published per-token price; priced at standard rates`,
		);
	} else if (tier !== "standard") {
		const spec = cost.tiers?.[tier];
		if (spec === undefined) {
			notes.add(
				`Served on the ${tier} tier, which has no known price for this model; priced at standard rates`,
			);
		} else if (typeof spec === "number") {
			sheet = scaleSheet(sheet, spec);
		} else if (!longContext) {
			sheet = spec;
		} else if (spec.longContext) {
			sheet = spec.longContext;
		} else if (lc) {
			sheet = ratioSheet(spec, cost, lc);
			notes.add(
				`No published ${tier}-tier rate above ${lc.threshold.toLocaleString("en-US")} input tokens; the long-context premium was applied to ${tier} rates`,
			);
		}
	}

	const regional = pricing.regional && !pricing.custom;
	if (regional && cost.regionalMultiplier) {
		sheet = scaleSheet(sheet, cost.regionalMultiplier);
	}

	if (write1h > 0 && sheet.cacheWriteInput1h === undefined) {
		notes.add(
			"1-hour cache writes were priced at the 5-minute write rate; this model has no 1-hour rate set",
		);
	}

	const writeRate = sheet.cacheWriteInput ?? sheet.noCacheInput;
	const audioRate = sheet.audioInput ?? sheet.noCacheInput;
	const audioCacheRate = sheet.audioCacheInput ?? sheet.cacheInput;

	const lines: CostLine[] = [];
	const add = (kind: CostLineKind, tokens: number, rate: number) => {
		if (tokens > 0) {
			lines.push({ kind, tokens, rate, cost: (tokens * rate) / 1_000_000 });
		}
	};

	const splitAudio = sheet.audioInput !== undefined;
	add(
		"input",
		splitAudio ? noCache - uncachedAudio : noCache,
		sheet.noCacheInput,
	);
	if (splitAudio) add("audioInput", uncachedAudio, audioRate);
	add("toolUseInput", toolUseInput, sheet.noCacheInput);
	add(
		"cacheRead",
		splitAudio ? cacheRead - cachedAudio : cacheRead,
		sheet.cacheInput,
	);
	if (splitAudio) add("audioCacheRead", cachedAudio, audioCacheRate);
	add("cacheWrite5m", write5m, writeRate);
	add("cacheWrite1h", write1h, sheet.cacheWriteInput1h ?? writeRate);
	add("output", output, sheet.output);

	return {
		cost: lines.reduce((sum, l) => sum + l.cost, 0),
		source: "rates",
		tier,
		longContext,
		regional,
		lines,
	};
};

/**
 * Price a run step by step. Long-context tiers, service tiers and cache TTLs
 * are all decided per request, so pricing the run's summed usage can't get
 * them right.
 */
export const priceRun = (
	steps: ReadonlyArray<PricedStep>,
	pricing: Pricing | null,
	opts: { interrupted: boolean },
): RunCost => {
	const notes = new Set<string>();
	const priced: StepCost[] = [];
	let total: number | null = 0;

	for (const step of steps) {
		const result = priceStep(step, pricing, notes);
		if (!result) {
			total = null;
			continue;
		}
		priced.push(result);
		if (total !== null) total += result.cost;
	}

	if (steps.length === 0) total = null;

	if (opts.interrupted && total !== null) {
		notes.add(
			"The run ended early; if a model request was in flight, the provider may have billed tokens for it that it never reported, and those are not included",
		);
	}

	return { total, estimateReasons: [...notes], steps: priced };
};
