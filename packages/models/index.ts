export type ModelStatus = "active" | "deprecated" | "retired";

export type ProviderType =
	| "xai"
	| "openai"
	| "azure"
	| "google"
	| "google-vertex"
	| "anthropic-vertex"
	| "bedrock";

export type ModelCost = {
	noCacheInput: number;
	cacheInput: number;
	output: number;
};

export type Model = {
	id: string;
	providers: ProviderType[];
	status: ModelStatus;
	cost: ModelCost;
	releaseDate?: string;
};

// Models are grouped by provider, and within each provider group they are
// ordered by release date, newest first. Keep this ordering when adding models.
export const MODELS: Model[] = [
	{
		id: "grok-4-1-fast-non-reasoning",
		providers: ["xai"],
		status: "retired",
		cost: { noCacheInput: 0.2, cacheInput: 0.05, output: 0.5 },
	},
	{
		id: "grok-4-1-fast-reasoning",
		providers: ["xai"],
		status: "retired",
		cost: { noCacheInput: 0.2, cacheInput: 0.05, output: 0.5 },
	},
	{
		id: "grok-4-fast-non-reasoning",
		providers: ["xai"],
		status: "retired",
		cost: { noCacheInput: 0.2, cacheInput: 0.05, output: 0.5 },
	},
	{
		id: "grok-4-fast-reasoning",
		providers: ["xai"],
		status: "retired",
		cost: { noCacheInput: 0.2, cacheInput: 0.05, output: 0.5 },
	},

	{
		id: "gpt-5.5",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 5, cacheInput: 0.5, output: 30 },
		releaseDate: "2026-04-24",
	},
	{
		id: "gpt-5.5-pro",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 30, cacheInput: 30, output: 180 },
		releaseDate: "2026-04-24",
	},
	{
		id: "gpt-5.4-mini",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 0.75, cacheInput: 0.075, output: 4.5 },
		releaseDate: "2026-03-17",
	},
	{
		id: "gpt-5.4-nano",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 0.2, cacheInput: 0.02, output: 1.25 },
		releaseDate: "2026-03-17",
	},
	{
		id: "gpt-5.4",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 2.5, cacheInput: 0.25, output: 15 },
		releaseDate: "2026-03-05",
	},
	{
		id: "gpt-5.4-pro",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 30, cacheInput: 30, output: 180 },
		releaseDate: "2026-03-05",
	},
	{
		id: "gpt-5.2",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 1.75, cacheInput: 0.175, output: 14 },
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
		cost: { noCacheInput: 1.25, cacheInput: 0.125, output: 10 },
		releaseDate: "2025-11-12",
	},
	{
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
		cost: { noCacheInput: 1.25, cacheInput: 0.125, output: 10 },
		releaseDate: "2025-08-07",
	},
	{
		id: "gpt-5-mini",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 0.25, cacheInput: 0.025, output: 2 },
		releaseDate: "2025-08-07",
	},
	{
		id: "gpt-5-nano",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 0.05, cacheInput: 0.005, output: 0.4 },
		releaseDate: "2025-08-07",
	},
	{
		id: "o4-mini",
		providers: ["openai", "azure"],
		status: "deprecated",
		cost: { noCacheInput: 1.1, cacheInput: 0.275, output: 4.4 },
		releaseDate: "2025-04-16",
	},
	{
		id: "gpt-4.1",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 2, cacheInput: 0.5, output: 8 },
		releaseDate: "2025-04-14",
	},
	{
		id: "gpt-4.1-mini",
		providers: ["openai", "azure"],
		status: "active",
		cost: { noCacheInput: 0.4, cacheInput: 0.1, output: 1.6 },
		releaseDate: "2025-04-14",
	},
	{
		id: "gpt-4.1-nano",
		providers: ["openai", "azure"],
		status: "deprecated",
		cost: { noCacheInput: 0.1, cacheInput: 0.025, output: 0.4 },
		releaseDate: "2025-04-14",
	},

	{
		id: "gemini-3.5-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 1.5, cacheInput: 0.15, output: 9 },
		releaseDate: "2026-05-19",
	},
	{
		id: "gemini-3.1-flash-lite",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 0.25, cacheInput: 0.025, output: 1.5 },
		releaseDate: "2026-05-07",
	},
	{
		id: "gemini-3.1-flash-lite-preview",
		providers: ["google", "google-vertex"],
		status: "deprecated",
		cost: { noCacheInput: 0.25, cacheInput: 0.025, output: 1.5 },
		releaseDate: "2026-03-03",
	},
	{
		id: "gemini-3.1-pro-preview",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 2, cacheInput: 0.2, output: 12 },
		releaseDate: "2026-02-19",
	},
	{
		id: "gemini-3-flash-preview",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 0.5, cacheInput: 0.05, output: 1 },
		releaseDate: "2025-12-17",
	},
	{
		id: "gemini-3-pro-preview",
		providers: ["google", "google-vertex"],
		status: "retired",
		cost: { noCacheInput: 2, cacheInput: 0.2, output: 12 },
		releaseDate: "2025-11-18",
	},
	{
		id: "gemini-2.5-flash-lite",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 0.1, cacheInput: 0.01, output: 0.4 },
		releaseDate: "2025-07-22",
	},
	{
		id: "gemini-2.5-pro",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 1.25, cacheInput: 0.125, output: 10 },
		releaseDate: "2025-06-17",
	},
	{
		id: "gemini-2.5-flash",
		providers: ["google", "google-vertex"],
		status: "active",
		cost: { noCacheInput: 0.3, cacheInput: 0.03, output: 1 },
		releaseDate: "2025-06-17",
	},

	{
		id: "claude-opus-4-8",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: { noCacheInput: 5, cacheInput: 0.5, output: 25 },
		releaseDate: "2026-05-28",
	},
	{
		id: "claude-opus-4-7",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: { noCacheInput: 5, cacheInput: 0.5, output: 25 },
	},
	{
		id: "claude-opus-4-6",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: { noCacheInput: 5, cacheInput: 0.5, output: 25 },
	},
	{
		id: "claude-sonnet-4-6",
		providers: ["anthropic-vertex"],
		status: "active",
		cost: { noCacheInput: 3, cacheInput: 0.3, output: 15 },
	},

	{
		id: "global.anthropic.claude-opus-4-5-20251101-v1:0",
		providers: ["bedrock"],
		status: "active",
		cost: { noCacheInput: 5, cacheInput: 0.5, output: 25 },
	},
	{
		id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
		providers: ["bedrock"],
		status: "active",
		cost: { noCacheInput: 1, cacheInput: 0.1, output: 5 },
	},
	{
		id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
		providers: ["bedrock"],
		status: "active",
		cost: { noCacheInput: 3, cacheInput: 0.3, output: 15 },
	},
];
