import {
	AnthropicIcon,
	AwsIcon,
	GeminiIcon,
	GoogleCloudIcon,
	MicrosoftIcon,
	OpenaiIcon,
	XaiIcon,
} from "@/components/boxicons";

export type ModelStatus = "active" | "deprecated" | "retired";

export interface Model {
	id: string;
	status: ModelStatus;
}

const OPENAI_MODELS: Model[] = [
	{ id: "gpt-5.4", status: "active" },
	{ id: "gpt-5.4-pro", status: "active" },
	{ id: "gpt-5.2", status: "active" },
	{ id: "gpt-5.1", status: "active" },
	{ id: "gpt-5.1-chat-latest", status: "deprecated" },
	{ id: "gpt-5-pro", status: "active" },
	{ id: "gpt-5", status: "active" },
	{ id: "gpt-5-mini", status: "active" },
	{ id: "gpt-5-nano", status: "active" },
	{ id: "gpt-4.1", status: "active" },
	{ id: "gpt-4.1-mini", status: "active" },
	{ id: "gpt-4.1-nano", status: "deprecated" },
	{ id: "o4-mini", status: "deprecated" },
];

const GEMINI_MODELS: Model[] = [
	{ id: "gemini-3.1-pro-preview", status: "active" },
	{ id: "gemini-3.1-flash-lite-preview", status: "active" },
	{ id: "gemini-3-flash-preview", status: "active" },
	{ id: "gemini-3-pro-preview", status: "retired" },
	{ id: "gemini-2.5-pro", status: "active" },
	{ id: "gemini-2.5-flash", status: "active" },
];

export function getModelStatus(
	providerType: string | undefined,
	modelId: string,
): ModelStatus | undefined {
	if (!providerType) return undefined;
	return PROVIDER_TYPES.find((p) => p.key === providerType)?.models.find(
		(m) => m.id === modelId,
	)?.status;
}

export const PROVIDER_TYPES = [
	{
		key: "xai",
		icon: XaiIcon,
		label: "XAI",
		models: [
			{ id: "grok-4-1-fast-non-reasoning", status: "retired" },
			{ id: "grok-4-1-fast-reasoning", status: "retired" },
			{ id: "grok-4-fast-non-reasoning", status: "retired" },
			{ id: "grok-4-fast-reasoning", status: "retired" },
		] satisfies Model[],
	},
	{
		key: "openai",
		icon: OpenaiIcon,
		label: "OpenAI",
		models: OPENAI_MODELS,
	},
	{
		key: "google-vertex",
		icon: GoogleCloudIcon,
		label: "Google Vertex AI",
		models: GEMINI_MODELS,
	},
	{
		key: "google",
		icon: GeminiIcon,
		label: "Google Generative AI",
		models: GEMINI_MODELS,
	},
	{
		key: "azure",
		icon: MicrosoftIcon,
		label: "Azure OpenAI",
		models: OPENAI_MODELS,
	},
	{
		key: "anthropic-vertex",
		icon: AnthropicIcon,
		label: "Anthropic Vertex AI",
		models: [
			{ id: "claude-opus-4-7", status: "active" },
			{ id: "claude-opus-4-6", status: "active" },
			{ id: "claude-sonnet-4-6", status: "active" },
		] satisfies Model[],
	},
	{
		key: "bedrock",
		icon: AwsIcon,
		label: "Amazon Bedrock",
		models: [
			{
				id: "global.anthropic.claude-opus-4-5-20251101-v1:0",
				status: "active",
			},
			{
				id: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
				status: "active",
			},
			{
				id: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
				status: "active",
			},
		] satisfies Model[],
	},
];
