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
	// Every parameter is add/remove: present with a value, or absent (undefined)
	// and omitted from the request. Undefined values are dropped on serialize;
	// the runner falls back where it needs to (Max Step Count → 10, Output Format
	// → text). Modeled as `T | undefined` (key kept, not `.optional()`) so the
	// form's defaultValues stay type-compatible.
	maxOutputTokens: z.union([z.number(), z.undefined()]),
	outputFormat: z.union([z.enum(["text", "json"]), z.undefined()]),
	temperature: z.union([z.number(), z.undefined()]),
	maxStepCount: z.union([z.number(), z.undefined()]),
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
	// Keyed by provider namespace (openai, openaiCompatible, openResponses, xai,
	// google, vertex, bedrock, …) → provider-specific options. The parameter
	// catalog in agent-parameters.tsx is the single source of truth for which
	// options are valid per provider, so this stays a permissive record rather
	// than an exhaustive shape that has to be kept in lockstep with the catalog.
	providerOptions: z.record(z.string(), z.record(z.string(), z.unknown())),
});

export type AgentFormValues = z.infer<typeof agentFormSchema>;
