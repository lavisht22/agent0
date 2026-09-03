import { MODELS, type ProviderModel, type ProviderType } from "@repo/models";
import {
	AnthropicIcon,
	AwsIcon,
	GeminiIcon,
	GoogleCloudIcon,
	MicrosoftIcon,
	OpenaiIcon,
	XaiIcon,
} from "@/components/boxicons";

export type {
	Model,
	ModelStatus,
	ProviderModel,
	ProviderType,
} from "@repo/models";
export { MODELS } from "@repo/models";

// `customModels` is a provider's own catalog; when present it is the only place
// its models are described, so the built-in list is not consulted at all.
export function getModelStatus(
	providerType: string | undefined,
	modelId: string,
	customModels?: ProviderModel[] | null,
) {
	if (customModels && customModels.length > 0) {
		const custom = customModels.find((m) => m.id === modelId);
		return custom ? (custom.status ?? "active") : undefined;
	}
	if (!providerType) return undefined;
	const model = MODELS.find(
		(m) =>
			m.id === modelId && m.providers.includes(providerType as ProviderType),
	);
	return model?.status;
}

export const PROVIDER_TYPES = [
	{ key: "xai", icon: XaiIcon, label: "XAI" },
	{ key: "openai", icon: OpenaiIcon, label: "OpenAI" },
	{ key: "google-vertex", icon: GoogleCloudIcon, label: "Google Vertex AI" },
	{ key: "google", icon: GeminiIcon, label: "Google Generative AI" },
	{ key: "azure", icon: MicrosoftIcon, label: "Azure OpenAI" },
	{
		key: "anthropic-vertex",
		icon: AnthropicIcon,
		label: "Anthropic Vertex AI",
	},
	{ key: "bedrock", icon: AwsIcon, label: "Amazon Bedrock" },
] satisfies {
	key: ProviderType;
	icon: React.FC<React.SVGProps<SVGSVGElement>>;
	label: string;
}[];
