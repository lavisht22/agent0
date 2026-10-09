import { costAt, MODELS } from "@repo/models";
import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { type PricedStep, priceRun, resolvePricing } from "./cost.js";

const usage = (u: {
	noCache?: number;
	cacheRead?: number;
	cacheWrite?: number;
	output?: number;
	raw?: Record<string, unknown>;
}): LanguageModelUsage => {
	const noCache = u.noCache ?? 0;
	const cacheRead = u.cacheRead ?? 0;
	const cacheWrite = u.cacheWrite ?? 0;
	const output = u.output ?? 0;
	return {
		inputTokens: noCache + cacheRead + cacheWrite,
		inputTokenDetails: {
			noCacheTokens: noCache,
			cacheReadTokens: cacheRead,
			cacheWriteTokens: cacheWrite,
		},
		outputTokens: output,
		outputTokenDetails: { textTokens: output, reasoningTokens: 0 },
		totalTokens: noCache + cacheRead + cacheWrite + output,
		raw: u.raw as LanguageModelUsage["raw"],
	};
};

const pricingFor = (
	providerType: string,
	modelId: string,
	extra: Partial<Parameters<typeof resolvePricing>[0]> = {},
) => {
	const pricing = resolvePricing({ providerType, modelId, ...extra });
	if (!pricing) throw new Error(`no pricing for ${modelId}`);
	return pricing;
};

const price = (
	steps: PricedStep[],
	pricing: ReturnType<typeof resolvePricing>,
	interrupted = false,
) => priceRun(steps, pricing, { interrupted });

const usd = (tokensTimesRate: number) => tokensTimesRate / 1_000_000;

describe("cache writes", () => {
	it("prices Bedrock 5-minute writes at 1.25x input", () => {
		const pricing = pricingFor("bedrock", "global.anthropic.claude-sonnet-4-6");
		const run = price(
			[
				{
					usage: usage({
						noCache: 1_000,
						cacheRead: 50_000,
						cacheWrite: 10_000,
						output: 2_000,
						raw: { cacheDetails: [{ ttl: "5m", inputTokens: 10_000 }] },
					}),
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(
			usd(1_000 * 3 + 50_000 * 0.3 + 10_000 * 3.75 + 2_000 * 15),
			10,
		);
		expect(run.estimateReasons).toEqual([]);
	});

	it("splits Anthropic writes by the TTL the response reports", () => {
		const pricing = pricingFor("anthropic-vertex", "claude-opus-4-8", {
			location: "global",
		});
		const run = price(
			[
				{
					usage: usage({
						cacheWrite: 10_000,
						raw: {
							cache_creation_input_tokens: 10_000,
							cache_creation: {
								ephemeral_5m_input_tokens: 4_000,
								ephemeral_1h_input_tokens: 6_000,
							},
						},
					}),
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(usd(4_000 * 6.25 + 6_000 * 10), 10);
	});

	it("splits Bedrock writes by cacheDetails TTL", () => {
		const pricing = pricingFor("bedrock", "global.anthropic.claude-opus-5-5");
		const run = price(
			[
				{
					usage: usage({
						cacheWrite: 248,
						raw: {
							cacheDetails: [
								{ ttl: "1h", inputTokens: 100 },
								{ ttl: "5m", inputTokens: 148 },
							],
						},
					}),
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(usd(100 * 8 + 148 * 5), 10);
	});

	it("treats unreported TTL as 5 minutes", () => {
		const pricing = pricingFor("bedrock", "global.anthropic.claude-sonnet-5");
		const run = price([{ usage: usage({ cacheWrite: 1_000 }) }], pricing);
		expect(run.total).toBeCloseTo(usd(1_000 * 2.5), 10);
	});

	it("prices OpenAI GPT-5.6+ writes and leaves older models' writes at input", () => {
		const newer = price(
			[{ usage: usage({ noCache: 100, cacheWrite: 1_000 }) }],
			pricingFor("openai", "gpt-6-sol"),
		);
		expect(newer.total).toBeCloseTo(usd(100 * 2 + 1_000 * 2.5), 10);

		const older = price(
			[{ usage: usage({ noCache: 100, cacheWrite: 1_000 }) }],
			pricingFor("openai", "gpt-5.2"),
		);
		expect(older.total).toBeCloseTo(usd(1_100 * 1.75), 10);
	});

	it("flags 1-hour writes on a custom model without a 1-hour rate", () => {
		const pricing = pricingFor("bedrock", "my-claude", {
			customModels: [
				{
					id: "my-claude",
					cost: {
						noCacheInput: 3,
						cacheInput: 0.3,
						cacheWriteInput: 3.75,
						output: 15,
					},
				},
			],
		});
		const run = price(
			[
				{
					usage: usage({
						cacheWrite: 1_000,
						raw: { cacheDetails: [{ ttl: "1h", inputTokens: 1_000 }] },
					}),
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(usd(1_000 * 3.75), 10);
		expect(run.estimateReasons).toHaveLength(1);
	});

	it("bills a legacy custom model's writes as ordinary input", () => {
		const pricing = pricingFor("openai-compatible", "llama", {
			customModels: [
				{ id: "llama", cost: { noCacheInput: 1, cacheInput: 0.1, output: 2 } },
			],
		});
		const run = price([{ usage: usage({ cacheWrite: 1_000 }) }], pricing);
		expect(run.total).toBeCloseTo(usd(1_000 * 1), 10);
		expect(run.estimateReasons).toEqual([]);
	});
});

describe("long context", () => {
	it("bills a whole OpenAI request over 272K at long-context rates", () => {
		const pricing = pricingFor("openai", "gpt-5.4");
		const run = price(
			[
				{
					usage: usage({ noCache: 200_000, cacheRead: 80_000, output: 1_000 }),
				},
			],
			pricing,
		);
		expect(run.steps[0].longContext).toBe(true);
		expect(run.total).toBeCloseTo(
			usd(200_000 * 5 + 80_000 * 0.5 + 1_000 * 22.5),
			10,
		);
	});

	it("bills Haiku 5.5 at 5x above 100K, cache writes included", () => {
		const pricing = pricingFor("bedrock", "global.anthropic.claude-haiku-5-5");
		const run = price(
			[
				{
					usage: usage({
						noCache: 10_000,
						cacheRead: 80_000,
						cacheWrite: 20_000,
						output: 1_000,
					}),
				},
			],
			pricing,
		);
		expect(run.steps[0].longContext).toBe(true);
		expect(run.total).toBeCloseTo(
			usd(10_000 * 0.5 + 80_000 * 0.05 + 20_000 * 0.625 + 1_000 * 2.5),
			10,
		);
	});

	it("decides per request, not on the run's summed input", () => {
		const pricing = pricingFor("openai", "gpt-5.4");
		const step = { usage: usage({ noCache: 150_000, output: 100 }) };
		const run = price([step, step], pricing);
		expect(run.steps.every((s) => !s.longContext)).toBe(true);
		expect(run.total).toBeCloseTo(usd(2 * (150_000 * 2.5 + 100 * 15)), 10);
	});

	it("counts cached tokens toward Gemini's 200K threshold", () => {
		const pricing = pricingFor("google", "gemini-2.5-pro");
		const run = price(
			[
				{
					usage: usage({ noCache: 10_000, cacheRead: 195_000, output: 1_000 }),
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(
			usd(10_000 * 2.5 + 195_000 * 0.25 + 1_000 * 15),
			10,
		);
	});
});

describe("service tiers", () => {
	it("prices the tier OpenAI reports, not the one requested", () => {
		const pricing = pricingFor("openai", "gpt-6-sol");
		const run = price(
			[
				{
					usage: usage({ noCache: 1_000, output: 1_000 }),
					providerMetadata: { openai: { serviceTier: "priority" } },
				},
				{
					usage: usage({ noCache: 1_000, output: 1_000 }),
					providerMetadata: { openai: { serviceTier: "default" } },
				},
			],
			pricing,
		);
		expect(run.steps.map((s) => s.tier)).toEqual(["priority", "standard"]);
		expect(run.total).toBeCloseTo(
			usd(1_000 * 4 + 1_000 * 20 + 1_000 * 2 + 1_000 * 10),
			10,
		);
	});

	it("reads Azure's tier from its own metadata key", () => {
		const pricing = pricingFor("azure", "gpt-5.4-mini");
		const run = price(
			[
				{
					usage: usage({ noCache: 1_000_000 }),
					providerMetadata: { azure: { serviceTier: "flex" } },
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(0.375, 10);
	});

	it("estimates Fast above 272K where no rate is published, and says so", () => {
		const pricing = pricingFor("openai", "gpt-5.4");
		const run = price(
			[
				{
					usage: usage({ noCache: 300_000 }),
					providerMetadata: { openai: { serviceTier: "priority" } },
				},
			],
			pricing,
		);
		// Fast input 5, scaled by the standard long-context premium (5 / 2.5).
		expect(run.total).toBeCloseTo(usd(300_000 * 10), 10);
		expect(run.estimateReasons).toHaveLength(1);
	});

	it("prices Vertex Gemini flex and flags provisioned throughput", () => {
		const pricing = pricingFor("google-vertex", "gemini-2.5-pro", {
			location: "global",
		});
		const flex = price(
			[
				{
					usage: usage({
						noCache: 100_000,
						raw: { trafficType: "ON_DEMAND_FLEX" },
					}),
				},
			],
			pricing,
		);
		expect(flex.total).toBeCloseTo(usd(100_000 * 0.625), 10);

		const provisioned = price(
			[
				{
					usage: usage({
						noCache: 100_000,
						raw: { trafficType: "PROVISIONED_THROUGHPUT" },
					}),
				},
			],
			pricing,
		);
		expect(provisioned.total).toBeCloseTo(usd(100_000 * 1.25), 10);
		expect(provisioned.estimateReasons).toHaveLength(1);
	});

	it("flags a tier with no published price", () => {
		const pricing = pricingFor("openai", "gpt-5-pro");
		const run = price(
			[
				{
					usage: usage({ noCache: 1_000 }),
					providerMetadata: { openai: { serviceTier: "scale" } },
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(usd(1_000 * 15), 10);
		expect(run.estimateReasons[0]).toContain("scale");
	});
});

describe("regional endpoints", () => {
	it("applies 1.1x for a regional Vertex location", () => {
		const regional = pricingFor("anthropic-vertex", "claude-sonnet-4-6", {
			location: "us-east5",
		});
		const run = price([{ usage: usage({ noCache: 1_000_000 }) }], regional);
		expect(run.total).toBeCloseTo(3.3, 10);
	});

	it("maps a Bedrock geo profile onto the global catalog entry at 1.1x", () => {
		const pricing = pricingFor("bedrock", "us.anthropic.claude-sonnet-4-6");
		expect(pricing.regional).toBe(true);
		const run = price([{ usage: usage({ output: 1_000_000 }) }], pricing);
		expect(run.total).toBeCloseTo(16.5, 10);
	});

	it("leaves Gemini 2.5 unchanged on a regional endpoint", () => {
		const pricing = pricingFor("google-vertex", "gemini-2.5-flash", {
			location: "us-central1",
		});
		const run = price([{ usage: usage({ output: 1_000_000 }) }], pricing);
		expect(run.total).toBeCloseTo(2.5, 10);
	});

	it("never uplifts a custom price", () => {
		const pricing = pricingFor("anthropic-vertex", "claude-custom", {
			location: "us-east5",
			customModels: [
				{
					id: "claude-custom",
					cost: { noCacheInput: 1, cacheInput: 0.1, output: 5 },
				},
			],
		});
		const run = price([{ usage: usage({ noCache: 1_000_000 }) }], pricing);
		expect(run.total).toBeCloseTo(1, 10);
	});
});

describe("other provider signals", () => {
	it("uses xAI's reported cost over computed rates", () => {
		const pricing = pricingFor("xai", "grok-4-fast-reasoning");
		const run = price(
			[
				{
					usage: usage({ noCache: 1_000, output: 1_000 }),
					providerMetadata: { xai: { costInUsdTicks: 123_456_789 } },
				},
			],
			pricing,
		);
		expect(run.total).toBeCloseTo(0.0123456789, 12);
		expect(run.steps[0].source).toBe("provider");
	});

	it("prices Gemini audio input at the audio rate", () => {
		const pricing = pricingFor("google", "gemini-2.5-flash");
		const run = price(
			[
				{
					usage: usage({
						noCache: 3_000,
						cacheRead: 1_000,
						raw: {
							promptTokensDetails: [
								{ modality: "TEXT", tokenCount: 2_500 },
								{ modality: "AUDIO", tokenCount: 1_500 },
							],
							cacheTokensDetails: [{ modality: "AUDIO", tokenCount: 500 }],
						},
					}),
				},
			],
			pricing,
		);
		// 1,000 uncached audio, 2,000 uncached text, 500 cached audio, 500 cached text.
		expect(run.total).toBeCloseTo(
			usd(2_000 * 0.3 + 1_000 * 1 + 500 * 0.03 + 500 * 0.1),
			10,
		);
	});
});

describe("run-level behaviour", () => {
	it("has no cost for a model nobody prices", () => {
		expect(resolvePricing({ providerType: "openai", modelId: "nope" })).toBe(
			null,
		);
		const run = price([{ usage: usage({ noCache: 1 }) }], null);
		expect(run.total).toBe(null);
	});

	it("flags a run that ended early", () => {
		const pricing = pricingFor("openai", "gpt-5.2");
		const run = price([{ usage: usage({ noCache: 1_000 }) }], pricing, true);
		expect(run.total).toBeCloseTo(usd(1_000 * 1.75), 10);
		expect(run.estimateReasons).toHaveLength(1);
	});

	it("uses the price in effect when the run happened", () => {
		const model = MODELS.find((m) => m.id === "gemini-3.6-flash");
		if (!model) throw new Error("missing model");
		expect(costAt(model, new Date("2026-12-31T23:59:59Z")).noCacheInput).toBe(
			0.75,
		);
		expect(costAt(model, new Date("2027-01-01T00:00:00Z")).noCacheInput).toBe(
			1.5,
		);
	});
});
