import { MODELS, type ProviderType } from "@repo/models";
import {
	AnthropicIcon,
	AwsIcon,
	GeminiIcon,
	GoogleCloudIcon,
	MicrosoftIcon,
	OpenaiIcon,
	XaiIcon,
} from "@/components/boxicons";

export type { Model, ModelStatus, ProviderType } from "@repo/models";
export { MODELS } from "@repo/models";

export function getModelStatus(
	providerType: string | undefined,
	modelId: string,
) {
	if (!providerType) return undefined;
	const model = MODELS.find(
		(m) =>
			m.id === modelId &&
			m.providers.includes(providerType as ProviderType),
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
