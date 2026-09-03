import z from "zod";
import { messageSchema } from "@/components/messages";

export const skillSchema = z.object({
	id: z.string(),
	name: z.string().min(1),
	description: z.string().min(1),
	body: z.string().min(1),
});

export type Skill = z.infer<typeof skillSchema>;

export const agentFormSchema = z.object({
	model: z.object({
		provider_id: z.string(),
		name: z.string(),
	}),
	maxOutputTokens: z.number(),
	outputFormat: z.enum(["text", "json"]),
	temperature: z.number(),
	maxStepCount: z.number(),
	messages: z.array(messageSchema).min(1, "At least one message is required"),
	tools: z.array(
		z.union([
			z.object({
				type: z.literal("mcp").optional(),
				mcp_id: z.string(),
				name: z.string(),
			}),
			z.object({
				type: z.literal("custom"),
				title: z.string(),
				description: z.string(),
				inputSchema: z.record(z.string(), z.unknown()).optional(),
			}),
			z.object({
				type: z.literal("agent"),
				agent_id: z.string(),
				name: z.string(),
				description: z.string(),
			}),
		]),
	),
	skills: z.array(skillSchema),
	providerOptions: z.object({
		openai: z
			.object({
				reasoningEffort: z
					.enum(["none", "minimal", "low", "medium", "high", "xhigh"])
					.optional(),
			})
			.optional(),
		xai: z
			.object({
				reasoningEffort: z
					.enum(["none", "low", "medium", "high", "xhigh"])
					.optional(),
			})
			.optional(),
		google: z
			.object({
				thinkingConfig: z
					.object({
						thinkingBudget: z.number().optional(),
						thinkingLevel: z
							.enum(["minimal", "low", "medium", "high"])
							.optional(),
						includeThoughts: z.boolean().optional(),
					})
					.optional(),
			})
			.optional(),
		vertex: z
			.object({
				thinkingConfig: z
					.object({
						thinkingBudget: z.number().optional(),
						thinkingLevel: z
							.enum(["minimal", "low", "medium", "high"])
							.optional(),
						includeThoughts: z.boolean().optional(),
					})
					.optional(),
			})
			.optional(),
		bedrock: z
			.object({
				reasoningConfig: z
					.object({
						type: z.enum(["adaptive", "disabled"]).optional(),
						maxReasoningEffort: z
							.enum(["low", "medium", "high", "xhigh", "max"])
							.optional(),
						display: z.enum(["omitted", "summarized"]).optional(),
					})
					.optional(),
			})
			.optional(),
	}),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
