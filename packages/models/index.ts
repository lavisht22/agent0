export type ModelStatus = "active" | "deprecated" | "retired";

export type ProviderType =
	| "xai"
	| "openai"
	| "openai-compatible"
	| "open-responses"
	| "azure"
	| "google"
	| "google-vertex"
	| "anthropic-vertex"
	| "bedrock";

// All prices are USD per 1M tokens. The three required fields are the shape
// custom models have always been stored in (providers.models jsonb), so every
// addition here is optional and an old row is still a complete price.
export type RateSheet = {
	noCacheInput: number;
	// Cache reads.
	cacheInput: number;
	output: number;
	// Cache writes: Anthropic's 5-minute TTL, OpenAI's GPT-5.6+ writes. Unset
	// means the provider bills writes as ordinary input.
	cacheWriteInput?: number;
	// Anthropic's 1-hour TTL writes. Unset falls back to `cacheWriteInput`.
	cacheWriteInput1h?: number;
	// Gemini models that price audio input above text. Unset means audio is
	// billed like any other input.
	audioInput?: number;
	audioCacheInput?: number;
};

// Above `threshold` input tokens in a single request (uncached + cache reads +
// cache writes), every provider in the catalog bills the whole request,
// output included, at these rates instead.
export type LongContextRates = RateSheet & { threshold: number };

// "priority" covers OpenAI's Fast tier (formerly Priority) and Gemini Priority.
export type ServiceTier = "flex" | "priority" | "ultrafast";

// A multiplier applies to the standard sheet and its long-context sheet alike.
// An explicit sheet without `longContext` has no published long-context rate,
// so a request over the threshold on that tier can only be estimated.
export type TierPricing = number | (RateSheet & { longContext?: RateSheet });

export type ModelCost = RateSheet & {
	longContext?: LongContextRates;
	tiers?: Partial<Record<ServiceTier, TierPricing>>;
	// Applied to every rate when the request is served from a regional (non-
	// global) endpoint: Vertex locations other than `global`, Bedrock inference
	// profiles other than `global.`.
	regionalMultiplier?: number;
};

// A model contributed by a single provider row instead of the built-in catalog
// below. Which provider serves it is implied by the row it hangs off, so a
// custom entry carries only what the app reads back: the id sent to the
// provider, and the cost used for run accounting.
export type ProviderModel = {
	id: string;
	cost: ModelCost;
	status?: ModelStatus;
	releaseDate?: string;
};

export type Model = {
	id: string;
	providers: ProviderType[];
	status: ModelStatus;
	// The price before the first entry in `costChanges` (or always, without it).
	cost: ModelCost;
	// Dated price changes, oldest first; each replaces `cost` from its `from`
	// instant (ISO 8601, UTC) onwards. Lets an announced change ship ahead of
	// time and keeps older runs priced at what they were billed.
	costChanges?: { from: string; cost: ModelCost }[];
	releaseDate?: string;
};

/** The model's price in effect at `at`. */
export const costAt = (model: Model, at: Date): ModelCost => {
	let cost = model.cost;
	for (const change of model.costChanges ?? []) {
		if (new Date(change.from).getTime() <= at.getTime()) cost = change.cost;
	}
	return cost;
};

// Claude on Vertex and Bedrock: 5-minute writes are 1.25x input, 1-hour writes
// 2x, and regional endpoints cost 1.1x global on every rate. No catalog Claude
// model has a long-context premium (4.6+ include 1M context at standard rates).
const claude = (
	input: number,
	cacheRead: number,
	cacheWrite5m: number,
	cacheWrite1h: number,
	output: number,
): ModelCost => ({
	noCacheInput: input,
	cacheInput: cacheRead,
	cacheWriteInput: cacheWrite5m,
	cacheWriteInput1h: cacheWrite1h,
	output,
	regionalMultiplier: 1.1,
});

// OpenAI bills a request over 272K input tokens entirely at the long-context
// rates (2x input and cache, 1.5x output).
const OPENAI_LONG_CONTEXT = 272_000;
// Gemini Pro models bill a prompt over 200K tokens entirely at higher rates.
const GEMINI_LONG_CONTEXT = 200_000;
// Gemini Priority is 1.8x and Flex 0.5x on both the Gemini API and Vertex.
const GEMINI_TIERS = { priority: 1.8, flex: 0.5 } as const;

// Models are grouped by provider, and within each provider group they are
// ordered by release date, newest first. Keep this ordering when adding models.
//
// Prices were last verified against each provider's pricing page on
// 2026-10-09. When a provider changes a price, add a `costChanges` entry rather
// than editing `cost`, so runs before the change stay priced as billed.
export const MODELS: Model[] = [
	// xAI retired the fast models on 2026-05-15 12:00 PT. The slugs still work
	// but are served, and billed, as grok-4.3. xAI also reports the exact billed
	// amount on every response, which takes precedence over these rates.
	...[
		"grok-4-1-fast-non-reasoning",
		"grok-4-1-fast-reasoning",
		"grok-4-fast-non-reasoning",
		"grok-4-fast-reasoning",
	].map(
		(id): Model => ({
			id,
			providers: ["xai"],
			status: "retired",
			cost: {
				noCacheInput: 0.2,
				cacheInput: 0.05,
				output: 0.5,
				longContext: {
					threshold: 128_000,
					noCacheInput: 0.4,
					cacheInput: 0.05,
					output: 1,
				},
			},
			costChanges: [
				{
					from: "2026-05-15T19:00:00Z",
					cost: {
						noCacheInput: 1.25,
						cacheInput: 0.2,
						output: 2.5,
						longContext: {
							threshold: 200_000,
							noCacheInput: 2.5,
							cacheInput: 0.4,
							output: 5,
						},
						tiers: { priority: 2 },
					},
				},
			],
		}),
	),

	{
		id: "gpt-6.1-sol",
		providers: ["openai"],
		status: "active",
		cost: {
			noCacheInput: 2,
			cacheInput: 0.1,
			cacheWriteInput: 2.5,
			output: 10,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 4,
				cacheInput: 0.2,
				cacheWriteInput: 5,
				output: 15,
			},
			tiers: { flex: 0.5, priority: 2, ultrafast: 6 },
		},
		releaseDate: "2026-09-29",
	},
	{
		id: "gpt-6-sol",
		providers: ["openai"],
		status: "active",
		cost: {
			noCacheInput: 2,
			cacheInput: 0.2,
			cacheWriteInput: 2.5,
			output: 10,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 4,
				cacheInput: 0.4,
				cacheWriteInput: 5,
				output: 15,
			},
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2026-09-22",
	},
	{
		id: "gpt-6-luna",
		providers: ["openai"],
		status: "active",
		cost: {
			noCacheInput: 0.1,
			cacheInput: 0.01,
			cacheWriteInput: 0.125,
			output: 0.5,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 0.2,
				cacheInput: 0.02,
				cacheWriteInput: 0.25,
				output: 0.75,
			},
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2026-09-22",
	},
	{
		// Promotional price, "available at least through November 21, 2026";
		// the list price is $5 input / $30 output.
		id: "gpt-5.6-sol",
		providers: ["openai"],
		status: "active",
		cost: {
			noCacheInput: 4,
			cacheInput: 0.4,
			cacheWriteInput: 5,
			output: 20,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 8,
				cacheInput: 0.8,
				cacheWriteInput: 10,
				output: 30,
			},
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2026-07-09",
	},
	{
		id: "gpt-5.6-terra",
		providers: ["openai"],
		status: "active",
		cost: {
			noCacheInput: 2,
			cacheInput: 0.2,
			cacheWriteInput: 2.5,
			output: 12,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 4,
				cacheInput: 0.4,
				cacheWriteInput: 5,
				output: 18,
			},
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2026-07-09",
	},
	{
		id: "gpt-5.6-luna",
		providers: ["openai"],
		status: "active",
		cost: {
			noCacheInput: 0.2,
			cacheInput: 0.02,
			cacheWriteInput: 0.25,
			output: 1.2,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 0.4,
				cacheInput: 0.04,
				cacheWriteInput: 0.5,
				output: 1.8,
			},
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2026-07-09",
	},
	{
		id: "gpt-5.5",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 5,
			cacheInput: 0.5,
			output: 30,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 10,
				cacheInput: 1,
				output: 45,
			},
			// Fast has no published long-context rate for this model.
			tiers: {
				flex: 0.5,
				priority: { noCacheInput: 12.5, cacheInput: 1.25, output: 75 },
			},
		},
		releaseDate: "2026-04-24",
	},
	{
		// No cached-input discount.
		id: "gpt-5.5-pro",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 30,
			cacheInput: 30,
			output: 180,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 60,
				cacheInput: 60,
				output: 270,
			},
			// Flex has no published long-context rate for this model.
			tiers: { flex: { noCacheInput: 15, cacheInput: 15, output: 90 } },
		},
		releaseDate: "2026-04-24",
	},
	{
		id: "gpt-5.4-mini",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 0.75,
			cacheInput: 0.075,
			output: 4.5,
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2026-03-17",
	},
	{
		id: "gpt-5.4-nano",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 0.2,
			cacheInput: 0.02,
			output: 1.25,
			tiers: { flex: 0.5 },
		},
		releaseDate: "2026-03-17",
	},
	{
		id: "gpt-5.4",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 2.5,
			cacheInput: 0.25,
			output: 15,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 5,
				cacheInput: 0.5,
				output: 22.5,
			},
			// Fast has no published long-context rate for this model.
			tiers: {
				flex: 0.5,
				priority: { noCacheInput: 5, cacheInput: 0.5, output: 30 },
			},
		},
		releaseDate: "2026-03-05",
	},
	{
		// No cached-input discount.
		id: "gpt-5.4-pro",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 30,
			cacheInput: 30,
			output: 180,
			longContext: {
				threshold: OPENAI_LONG_CONTEXT,
				noCacheInput: 60,
				cacheInput: 60,
				output: 270,
			},
			tiers: { flex: 0.5 },
		},
		releaseDate: "2026-03-05",
	},
	{
		id: "gpt-5.2",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 1.75,
			cacheInput: 0.175,
			output: 14,
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2025-12-11",
	},
	{
		id: "gpt-5.1-chat-latest",
		providers: ["openai", "azure"],
		status: "deprecated",
		cost: { noCacheInput: 1.25, cacheInput: 0.125, output: 10 },
		releaseDate: "2025-11-19",
	},
	{
		id: "gpt-5.1",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 1.25,
			cacheInput: 0.125,
			output: 10,
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2025-11-12",
	},
	{
		// No cached-input discount.
		id: "gpt-5-pro",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 15, cacheInput: 15, output: 120 },
		releaseDate: "2025-08-07",
	},
	{
		id: "gpt-5",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 1.25,
			cacheInput: 0.125,
			output: 10,
			tiers: { flex: 0.5, priority: 2 },
		},
		releaseDate: "2025-08-07",
	},
	{
		id: "gpt-5-mini",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 0.25,
			cacheInput: 0.025,
			output: 2,
			tiers: {
				flex: 0.5,
				priority: { noCacheInput: 0.45, cacheInput: 0.045, output: 3.6 },
			},
		},
		releaseDate: "2025-08-07",
	},
	{
		id: "gpt-5-nano",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 0.05,
			cacheInput: 0.005,
			output: 0.4,
			tiers: { flex: 0.5 },
		},
		releaseDate: "2025-08-07",
	},
	{
		id: "o4-mini",
		providers: ["openai", "azure"],
		status: "deprecated",
		cost: {
			noCacheInput: 1.1,
			cacheInput: 0.275,
			output: 4.4,
			tiers: {
				flex: 0.5,
				priority: { noCacheInput: 2, cacheInput: 0.5, output: 8 },
			},
		},
		releaseDate: "2025-04-16",
	},
	{
		id: "gpt-4.1",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 2,
			cacheInput: 0.5,
			output: 8,
			tiers: {
				priority: { noCacheInput: 3.5, cacheInput: 0.875, output: 14 },
			},
		},
		releaseDate: "2025-04-14",
	},
	{
		id: "gpt-4.1-mini",
		providers: ["openai", "azure"],
		status: "active",
		cost: {
			noCacheInput: 0.4,
			cacheInput: 0.1,
			output: 1.6,
			tiers: {
				priority: { noCacheInput: 0.7, cacheInput: 0.175, output: 2.8 },
			},
		},
		releaseDate: "2025-04-14",
	},
	{
		id: "gpt-4.1-nano",
		providers: ["openai", "azure"],
		status: "deprecated",
		cost: {
			noCacheInput: 0.1,
			cacheInput: 0.025,
			output: 0.4,
			tiers: { priority: 2 },
		},
		releaseDate: "2025-04-14",
	},

	// Gemini 3.6–3.8 Flash are on introductory pricing through 2026-12-31 and
	// double on 2027-01-01. GA Gemini 3+ models cost 1.1x on regional (non-
	// global) Vertex endpoints; the previews are served from global only, and
	// Gemini 2.5 is priced the same everywhere.
	{
		id: "gemini-3.8-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.75,
			cacheInput: 0.075,
			output: 3.75,
			tiers: GEMINI_TIERS,
			regionalMultiplier: 1.1,
		},
		costChanges: [
			{
				from: "2027-01-01T00:00:00Z",
				cost: {
					noCacheInput: 1.5,
					cacheInput: 0.15,
					output: 7.5,
					tiers: GEMINI_TIERS,
					regionalMultiplier: 1.1,
				},
			},
		],
		releaseDate: "2026-09-02",
	},
	{
		id: "gemini-3.7-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.75,
			cacheInput: 0.075,
			output: 3.75,
			tiers: GEMINI_TIERS,
			regionalMultiplier: 1.1,
		},
		costChanges: [
			{
				from: "2027-01-01T00:00:00Z",
				cost: {
					noCacheInput: 1.5,
					cacheInput: 0.15,
					output: 7.5,
					tiers: GEMINI_TIERS,
					regionalMultiplier: 1.1,
				},
			},
		],
		releaseDate: "2026-08-13",
	},
	{
		id: "gemini-3.6-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.75,
			cacheInput: 0.075,
			output: 3.75,
			tiers: GEMINI_TIERS,
			regionalMultiplier: 1.1,
		},
		costChanges: [
			{
				from: "2027-01-01T00:00:00Z",
				cost: {
					noCacheInput: 1.5,
					cacheInput: 0.15,
					output: 7.5,
					tiers: GEMINI_TIERS,
					regionalMultiplier: 1.1,
				},
			},
		],
		releaseDate: "2026-07-21",
	},
	{
		id: "gemini-3.5-flash-lite",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.3,
			cacheInput: 0.03,
			output: 2.5,
			tiers: GEMINI_TIERS,
			regionalMultiplier: 1.1,
		},
		releaseDate: "2026-07-21",
	},
	{
		id: "gemini-3.5-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 1.5,
			cacheInput: 0.15,
			output: 9,
			tiers: GEMINI_TIERS,
			regionalMultiplier: 1.1,
		},
		releaseDate: "2026-05-19",
	},
	{
		id: "gemini-3.1-flash-lite",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.25,
			cacheInput: 0.025,
			output: 1.5,
			audioInput: 0.5,
			audioCacheInput: 0.05,
			tiers: GEMINI_TIERS,
			regionalMultiplier: 1.1,
		},
		releaseDate: "2026-05-07",
	},
	{
		id: "gemini-3.1-flash-lite-preview",
		providers: ["google", "google-vertex"],
		status: "deprecated",
		cost: {
			noCacheInput: 0.25,
			cacheInput: 0.025,
			output: 1.5,
			audioInput: 0.5,
			audioCacheInput: 0.05,
			tiers: GEMINI_TIERS,
		},
		releaseDate: "2026-03-03",
	},
	{
		id: "gemini-3.1-pro-preview",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 2,
			cacheInput: 0.2,
			output: 12,
			longContext: {
				threshold: GEMINI_LONG_CONTEXT,
				noCacheInput: 4,
				cacheInput: 0.4,
				output: 18,
			},
			tiers: {
				priority: 1.8,
				// Cache reads stay at the standard rate on Flex.
				flex: {
					noCacheInput: 1,
					cacheInput: 0.2,
					output: 6,
					longContext: { noCacheInput: 2, cacheInput: 0.4, output: 9 },
				},
			},
		},
		releaseDate: "2026-02-19",
	},
	{
		id: "gemini-3-flash-preview",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.5,
			cacheInput: 0.05,
			output: 3,
			audioInput: 1,
			audioCacheInput: 0.1,
			tiers: {
				priority: 1.8,
				// Cache reads stay at the standard rate on Flex.
				flex: {
					noCacheInput: 0.25,
					cacheInput: 0.05,
					output: 1.5,
					audioInput: 0.5,
					audioCacheInput: 0.1,
				},
			},
		},
		releaseDate: "2025-12-17",
	},
	{
		id: "gemini-3-pro-preview",
		providers: ["google", "google-vertex"],
		status: "retired",
		cost: {
			noCacheInput: 2,
			cacheInput: 0.2,
			output: 12,
			longContext: {
				threshold: GEMINI_LONG_CONTEXT,
				noCacheInput: 4,
				cacheInput: 0.4,
				output: 18,
			},
		},
		releaseDate: "2025-11-18",
	},
	{
		id: "gemini-2.5-flash-lite",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.1,
			cacheInput: 0.01,
			output: 0.4,
			audioInput: 0.3,
			audioCacheInput: 0.03,
			tiers: GEMINI_TIERS,
		},
		releaseDate: "2025-07-22",
	},
	{
		id: "gemini-2.5-pro",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 1.25,
			cacheInput: 0.125,
			output: 10,
			longContext: {
				threshold: GEMINI_LONG_CONTEXT,
				noCacheInput: 2.5,
				cacheInput: 0.25,
				output: 15,
			},
			tiers: GEMINI_TIERS,
		},
		releaseDate: "2025-06-17",
	},
	{
		id: "gemini-2.5-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: {
			noCacheInput: 0.3,
			cacheInput: 0.03,
			output: 2.5,
			audioInput: 1,
			audioCacheInput: 0.1,
			tiers: GEMINI_TIERS,
		},
		releaseDate: "2025-06-17",
	},

	{
		id: "claude-opus-5",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
		releaseDate: "2026-07-24",
	},
	{
		id: "claude-opus-4-8",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
		releaseDate: "2026-05-28",
	},
	{
		id: "claude-opus-4-7",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
	},
	{
		id: "claude-opus-4-6",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
	},
	{
		id: "claude-sonnet-5",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: claude(2, 0.2, 2.5, 4, 10),
	},
	{
		id: "claude-sonnet-4-6",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: claude(3, 0.3, 3.75, 6, 15),
	},

	{
		// The one catalog Claude model with a long-context premium: a prompt over
		// 100K tokens bills every token in the request at 5x.
		id: "global.anthropic.claude-haiku-5-5",
		providers: ["bedrock"],
		status: "active",
		cost: {
			...claude(0.1, 0.01, 0.125, 0.2, 0.5),
			longContext: {
				threshold: 100_000,
				noCacheInput: 0.5,
				cacheInput: 0.05,
				cacheWriteInput: 0.625,
				cacheWriteInput1h: 1,
				output: 2.5,
			},
		},
		releaseDate: "2026-10-07",
	},
	{
		id: "global.anthropic.claude-opus-5-5",
		providers: ["bedrock"],
		status: "active",
		cost: claude(4, 0.2, 5, 8, 20),
		releaseDate: "2026-09-22",
	},
	{
		id: "global.anthropic.claude-opus-5",
		providers: ["bedrock"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
		releaseDate: "2026-07-24",
	},
	{
		id: "global.anthropic.claude-sonnet-5-5",
		providers: ["bedrock"],
		status: "active",
		cost: claude(2, 0.2, 2.5, 4, 10),
		// Bedrock halved the cache-read price.
		costChanges: [
			{ from: "2026-10-07T00:00:00Z", cost: claude(2, 0.1, 2.5, 4, 10) },
		],
		releaseDate: "2026-09-28",
	},
	{
		id: "global.anthropic.claude-sonnet-5",
		providers: ["bedrock"],
		status: "active",
		cost: claude(2, 0.2, 2.5, 4, 10),
	},
	{
		id: "global.anthropic.claude-opus-4-8",
		providers: ["bedrock"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
		releaseDate: "2026-05-28",
	},
	{
		id: "global.anthropic.claude-opus-4-7",
		providers: ["bedrock"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
		releaseDate: "2026-04-16",
	},
	{
		id: "global.anthropic.claude-sonnet-4-6",
		providers: ["bedrock"],
		status: "active",
		cost: claude(3, 0.3, 3.75, 6, 15),
		releaseDate: "2026-02-17",
	},
	{
		id: "global.anthropic.claude-opus-4-6-v1",
		providers: ["bedrock"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
		releaseDate: "2026-02-05",
	},
	{
		id: "global.anthropic.claude-opus-4-5-20251101-v1:0",
		providers: ["bedrock"],
		status: "active",
		cost: claude(5, 0.5, 6.25, 10, 25),
	},
	{
		id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
		providers: ["bedrock"],
		status: "active",
		cost: claude(1, 0.1, 1.25, 2, 5),
	},
	{
		id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
		providers: ["bedrock"],
		status: "active",
		cost: claude(3, 0.3, 3.75, 6, 15),
	},
];
