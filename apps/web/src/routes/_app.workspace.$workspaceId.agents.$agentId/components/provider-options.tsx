import { Divider, Input, Select, SelectItem, Switch } from "@heroui/react";

/**
 * Provider-specific options type matching the form schema.
 */
export type ProviderOptionsValue = {
	openai?: {
		reasoningEffort?: "minimal" | "low" | "medium" | "high";
		reasoningSummary?: "auto" | "detailed";
	};
	xai?: {
		reasoningEffort?: "low" | "medium" | "high";
	};
	google?: {
		thinkingConfig?: {
			thinkingBudget?: number;
			thinkingLevel?: "minimal" | "low" | "medium" | "high";
			includeThoughts?: boolean;
		};
		mediaResolution?:
			| "MEDIA_RESOLUTION_UNSPECIFIED"
			| "MEDIA_RESOLUTION_LOW"
			| "MEDIA_RESOLUTION_MEDIUM"
			| "MEDIA_RESOLUTION_HIGH";
	};
};

interface ProviderOptionsProps {
	providerType: string;
	value: ProviderOptionsValue | undefined;
	onValueChange: (value: ProviderOptionsValue) => void;
}

/**
 * Provider-specific options UI for reasoning/thinking configuration.
 * Shows different options based on the provider type.
 */
export function ProviderOptions({
	providerType,
	value,
	onValueChange,
}: ProviderOptionsProps) {
	// Only show for providers with reasoning options
	if (
		!["openai", "xai", "azure", "google", "google-vertex"].includes(
			providerType,
		)
	) {
		return null;
	}

	return (
		<>
			<Divider className="my-2" />

			{/* OpenAI / Azure reasoning options */}
			{(providerType === "openai" || providerType === "azure") && (
				<>
					<Select
						isClearable
						variant="bordered"
						label="Reasoning Effort"
						placeholder="Not set"
						selectedKeys={
							value?.openai?.reasoningEffort
								? [value.openai.reasoningEffort]
								: []
						}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as
								| "minimal"
								| "low"
								| "medium"
								| "high"
								| undefined;
							onValueChange({
								...value,
								openai: {
									...value?.openai,
									reasoningEffort: selected,
								},
							});
						}}
					>
						<SelectItem key="minimal">Minimal</SelectItem>
						<SelectItem key="low">Low</SelectItem>
						<SelectItem key="medium">Medium</SelectItem>
						<SelectItem key="high">High</SelectItem>
					</Select>
					<Select
						isClearable
						variant="bordered"
						label="Reasoning Summary"
						placeholder="Not set"
						description="Controls whether the model returns its reasoning process"
						selectedKeys={
							value?.openai?.reasoningSummary
								? [value.openai.reasoningSummary]
								: []
						}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as
								| "auto"
								| "detailed"
								| undefined;
							onValueChange({
								...value,
								openai: {
									...value?.openai,
									reasoningSummary: selected,
								},
							});
						}}
					>
						<SelectItem key="auto">Auto (condensed summary)</SelectItem>
						<SelectItem key="detailed">
							Detailed (comprehensive reasoning)
						</SelectItem>
					</Select>
				</>
			)}

			{/* xAI reasoning effort */}
			{providerType === "xai" && (
				<Select
					isClearable
					variant="bordered"
					label="Reasoning Effort"
					placeholder="Not set"
					selectedKeys={
						value?.xai?.reasoningEffort ? [value.xai.reasoningEffort] : []
					}
					onSelectionChange={(keys) => {
						const selected = Array.from(keys)[0] as
							| "low"
							| "medium"
							| "high"
							| undefined;
						onValueChange({
							...value,
							xai: { reasoningEffort: selected },
						});
					}}
				>
					<SelectItem key="low">Low</SelectItem>
					<SelectItem key="medium">Medium</SelectItem>
					<SelectItem key="high">High</SelectItem>
				</Select>
			)}

			{/* Google / Vertex thinking config */}
			{(providerType === "google" || providerType === "google-vertex") && (
				<>
					<div className="flex flex-col gap-2 w-full">
						<div className="flex gap-2 w-full">
							<Select
								className="flex-1"
								variant="bordered"
								label="Thinking Level"
								placeholder="Not set"
								isClearable
								isDisabled={!!value?.google?.thinkingConfig?.thinkingBudget}
								selectedKeys={
									value?.google?.thinkingConfig?.thinkingLevel
										? [value.google.thinkingConfig.thinkingLevel]
										: []
								}
								onSelectionChange={(keys) => {
									const selected = Array.from(keys)[0] as
										| "minimal"
										| "low"
										| "medium"
										| "high"
										| undefined;
									onValueChange({
										...value,
										google: {
											thinkingConfig: {
												includeThoughts:
													value?.google?.thinkingConfig?.includeThoughts,
												thinkingLevel: selected,
												thinkingBudget: undefined,
											},
										},
									});
								}}
							>
								<SelectItem key="minimal">Minimal</SelectItem>
								<SelectItem key="low">Low</SelectItem>
								<SelectItem key="medium">Medium</SelectItem>
								<SelectItem key="high">High</SelectItem>
							</Select>
							<Input
								className="flex-1"
								isClearable
								variant="bordered"
								type="number"
								label="Thinking Budget"
								placeholder="e.g. 8192"
								isDisabled={!!value?.google?.thinkingConfig?.thinkingLevel}
								value={
									value?.google?.thinkingConfig?.thinkingBudget?.toString() ||
									""
								}
								onValueChange={(inputValue) => {
									const numValue = inputValue
										? parseInt(inputValue, 10)
										: undefined;
									onValueChange({
										...value,
										google: {
											thinkingConfig: {
												includeThoughts:
													value?.google?.thinkingConfig?.includeThoughts,
												thinkingBudget: numValue,
												thinkingLevel: undefined,
											},
										},
									});
								}}
							/>
						</div>
						<p className="text-xs text-default-500">
							Use Thinking Level with 3 series and Thinking Budget with 2.5
							series models
						</p>
					</div>
					<Switch
						size="sm"
						isSelected={value?.google?.thinkingConfig?.includeThoughts || false}
						onValueChange={(checked) => {
							onValueChange({
								...value,
								google: {
									...value?.google,
									thinkingConfig: {
										...value?.google?.thinkingConfig,
										includeThoughts: checked,
									},
								},
							});
						}}
					>
						Include Thoughts
					</Switch>
					<Select
						isClearable
						variant="bordered"
						label="Media Resolution"
						placeholder="Not set"
						description="Controls the resolution for processing media inputs"
						selectedKeys={
							value?.google?.mediaResolution
								? [value.google.mediaResolution]
								: []
						}
						onSelectionChange={(keys) => {
							const selected = Array.from(keys)[0] as
								| "MEDIA_RESOLUTION_UNSPECIFIED"
								| "MEDIA_RESOLUTION_LOW"
								| "MEDIA_RESOLUTION_MEDIUM"
								| "MEDIA_RESOLUTION_HIGH"
								| undefined;
							onValueChange({
								...value,
								google: {
									...value?.google,
									mediaResolution: selected,
								},
							});
						}}
					>
						<SelectItem key="MEDIA_RESOLUTION_UNSPECIFIED">
							Unspecified
						</SelectItem>
						<SelectItem key="MEDIA_RESOLUTION_LOW">Low</SelectItem>
						<SelectItem key="MEDIA_RESOLUTION_MEDIUM">Medium</SelectItem>
						<SelectItem key="MEDIA_RESOLUTION_HIGH">High</SelectItem>
					</Select>
				</>
			)}
		</>
	);
}
