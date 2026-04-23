import {
	Description,
	Input,
	Label,
	ListBox,
	Select,
	Separator,
	Switch,
	TextField,
} from "@heroui/react";

/**
 * Provider-specific options type matching the form schema.
 */
type GoogleVertexOptionsValue = {
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

export type ProviderOptionsValue = {
	openai?: {
		reasoningEffort?: "minimal" | "low" | "medium" | "high";
		reasoningSummary?: "auto" | "detailed";
	};
	xai?: {
		reasoningEffort?: "low" | "medium" | "high";
	};
	google?: GoogleVertexOptionsValue;
	vertex?: GoogleVertexOptionsValue;
};

interface ProviderOptionsProps {
	providerType: string;
	value: ProviderOptionsValue | undefined;
	onValueChange: (value: ProviderOptionsValue) => void;
}

function GoogleVertexOptions({
	optionsKey,
	value,
	onValueChange,
}: {
	optionsKey: "google" | "vertex";
	value: ProviderOptionsValue | undefined;
	onValueChange: (value: ProviderOptionsValue) => void;
}) {
	const opts = value?.[optionsKey];
	const setOpts = (newOpts: GoogleVertexOptionsValue) => {
		onValueChange({ ...value, [optionsKey]: newOpts });
	};

	return (
		<>
			<div className="flex flex-col gap-2 w-full">
				<div className="flex gap-2 w-full">
					<Select
						className="flex-1"
						placeholder="Not set"
						isDisabled={!!opts?.thinkingConfig?.thinkingBudget}
						value={opts?.thinkingConfig?.thinkingLevel ?? null}
						onChange={(selected) => {
							setOpts({
								thinkingConfig: {
									includeThoughts: opts?.thinkingConfig?.includeThoughts,
									thinkingLevel: selected as
										| "minimal"
										| "low"
										| "medium"
										| "high"
										| undefined,
									thinkingBudget: undefined,
								},
							});
						}}
						variant="secondary"
					>
						<Label>Thinking Level</Label>
						<Select.Trigger>
							<Select.Value />
							<Select.Indicator />
						</Select.Trigger>
						<Select.Popover>
							<ListBox>
								<ListBox.Item id="minimal" textValue="Minimal">
									Minimal
								</ListBox.Item>
								<ListBox.Item id="low" textValue="Low">
									Low
								</ListBox.Item>
								<ListBox.Item id="medium" textValue="Medium">
									Medium
								</ListBox.Item>
								<ListBox.Item id="high" textValue="High">
									High
								</ListBox.Item>
							</ListBox>
						</Select.Popover>
					</Select>
					<TextField
						className="flex-1"
						isDisabled={!!opts?.thinkingConfig?.thinkingLevel}
						variant="secondary"
					>
						<Label>Thinking Budget</Label>
						<Input
							type="number"
							placeholder="e.g. 8192"
							value={opts?.thinkingConfig?.thinkingBudget?.toString() || ""}
							onChange={(e) => {
								const inputValue = e.target.value;
								const numValue = inputValue
									? parseInt(inputValue, 10)
									: undefined;
								setOpts({
									thinkingConfig: {
										includeThoughts: opts?.thinkingConfig?.includeThoughts,
										thinkingBudget: numValue,
										thinkingLevel: undefined,
									},
								});
							}}
						/>
					</TextField>
				</div>
				<p className="text-xs text-default-500">
					Use Thinking Level with 3 series and Thinking Budget with 2.5 series
					models
				</p>
			</div>
			<Switch
				isSelected={opts?.thinkingConfig?.includeThoughts || false}
				onChange={(checked) => {
					setOpts({
						...opts,
						thinkingConfig: {
							...opts?.thinkingConfig,
							includeThoughts: checked,
						},
					});
				}}
			>
				<Switch.Control>
					<Switch.Thumb />
				</Switch.Control>
				<Switch.Content>
					<Label>Include Thoughts</Label>
				</Switch.Content>
			</Switch>
			<Select
				placeholder="Not set"
				value={opts?.mediaResolution ?? null}
				onChange={(selected) => {
					setOpts({
						...opts,
						mediaResolution: selected as
							| "MEDIA_RESOLUTION_UNSPECIFIED"
							| "MEDIA_RESOLUTION_LOW"
							| "MEDIA_RESOLUTION_MEDIUM"
							| "MEDIA_RESOLUTION_HIGH"
							| undefined,
					});
				}}
				variant="secondary"
				fullWidth
			>
				<Label>Media Resolution</Label>
				<Select.Trigger>
					<Select.Value />
					<Select.Indicator />
				</Select.Trigger>
				<Description>
					Controls the resolution for processing media inputs
				</Description>
				<Select.Popover>
					<ListBox>
						<ListBox.Item
							id="MEDIA_RESOLUTION_UNSPECIFIED"
							textValue="Unspecified"
						>
							Unspecified
						</ListBox.Item>
						<ListBox.Item id="MEDIA_RESOLUTION_LOW" textValue="Low">
							Low
						</ListBox.Item>
						<ListBox.Item id="MEDIA_RESOLUTION_MEDIUM" textValue="Medium">
							Medium
						</ListBox.Item>
						<ListBox.Item id="MEDIA_RESOLUTION_HIGH" textValue="High">
							High
						</ListBox.Item>
					</ListBox>
				</Select.Popover>
			</Select>
		</>
	);
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
			<Separator className="my-2" />

			{/* OpenAI / Azure reasoning options */}
			{(providerType === "openai" || providerType === "azure") && (
				<>
					<Select
						placeholder="Not set"
						value={value?.openai?.reasoningEffort ?? null}
						onChange={(selected) => {
							onValueChange({
								...value,
								openai: {
									...value?.openai,
									reasoningEffort: selected as
										| "minimal"
										| "low"
										| "medium"
										| "high"
										| undefined,
								},
							});
						}}
						variant="secondary"
					>
						<Label>Reasoning Effort</Label>
						<Select.Trigger>
							<Select.Value />
							<Select.Indicator />
						</Select.Trigger>
						<Select.Popover>
							<ListBox>
								<ListBox.Item id="minimal" textValue="Minimal">
									Minimal
								</ListBox.Item>
								<ListBox.Item id="low" textValue="Low">
									Low
								</ListBox.Item>
								<ListBox.Item id="medium" textValue="Medium">
									Medium
								</ListBox.Item>
								<ListBox.Item id="high" textValue="High">
									High
								</ListBox.Item>
							</ListBox>
						</Select.Popover>
					</Select>
					<Select
						placeholder="Not set"
						value={value?.openai?.reasoningSummary ?? null}
						onChange={(selected) => {
							onValueChange({
								...value,
								openai: {
									...value?.openai,
									reasoningSummary: selected as "auto" | "detailed" | undefined,
								},
							});
						}}
						variant="secondary"
					>
						<Label>Reasoning Summary</Label>
						<Select.Trigger>
							<Select.Value />
							<Select.Indicator />
						</Select.Trigger>
						<Description>
							Controls whether the model returns its reasoning process
						</Description>
						<Select.Popover>
							<ListBox>
								<ListBox.Item id="auto" textValue="Auto (condensed summary)">
									Auto (condensed summary)
								</ListBox.Item>
								<ListBox.Item
									id="detailed"
									textValue="Detailed (comprehensive reasoning)"
								>
									Detailed (comprehensive reasoning)
								</ListBox.Item>
							</ListBox>
						</Select.Popover>
					</Select>
				</>
			)}

			{/* xAI reasoning effort */}
			{providerType === "xai" && (
				<Select
					placeholder="Not set"
					value={value?.xai?.reasoningEffort ?? null}
					onChange={(selected) => {
						onValueChange({
							...value,
							xai: {
								reasoningEffort: selected as
									| "low"
									| "medium"
									| "high"
									| undefined,
							},
						});
					}}
					variant="secondary"
				>
					<Label>Reasoning Effort</Label>
					<Select.Trigger>
						<Select.Value />
						<Select.Indicator />
					</Select.Trigger>
					<Select.Popover>
						<ListBox>
							<ListBox.Item id="low" textValue="Low">
								Low
							</ListBox.Item>
							<ListBox.Item id="medium" textValue="Medium">
								Medium
							</ListBox.Item>
							<ListBox.Item id="high" textValue="High">
								High
							</ListBox.Item>
						</ListBox>
					</Select.Popover>
				</Select>
			)}

			{/* Google / Vertex thinking config */}
			{(providerType === "google" || providerType === "google-vertex") && (
				<GoogleVertexOptions
					optionsKey={providerType === "google-vertex" ? "vertex" : "google"}
					value={value}
					onValueChange={onValueChange}
				/>
			)}
		</>
	);
}
