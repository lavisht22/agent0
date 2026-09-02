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

type BedrockReasoningConfig = {
	type?: "adaptive" | "disabled";
	maxReasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max";
	display?: "omitted" | "summarized";
};

export type ProviderOptionsValue = {
	openai?: {
		reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
		reasoningSummary?: "auto" | "detailed";
	};
	xai?: {
		reasoningEffort?: "low" | "medium" | "high";
	};
	google?: GoogleVertexOptionsValue;
	vertex?: GoogleVertexOptionsValue;
	bedrock?: {
		reasoningConfig?: BedrockReasoningConfig;
	};
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
				<p className="text-xs text-muted">
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

// Sentinel for the "Not set" item. A Select has no clear affordance once a
// value is picked, so each list carries an explicit item that maps back to
// undefined and drops the field from the request.
const UNSET = "__unset__";

// Anthropic models on Bedrock, Claude 4.6 and newer. Each control is set
// independently; Reasoning Effort maps to `output_config.effort`, and Display
// rides along on the thinking config, so the provider only forwards it under
// the "adaptive" mode. The legacy fixed thinking budget is not exposed.
function BedrockOptions({
	value,
	onValueChange,
}: {
	value: ProviderOptionsValue | undefined;
	onValueChange: (value: ProviderOptionsValue) => void;
}) {
	const opts = value?.bedrock?.reasoningConfig;
	const setOpts = (newOpts: BedrockReasoningConfig) => {
		onValueChange({ ...value, bedrock: { reasoningConfig: newOpts } });
	};

	return (
		<>
			<Select
				placeholder="Not set"
				value={opts?.type ?? null}
				onChange={(selected) => {
					setOpts({
						...opts,
						type:
							selected === UNSET
								? undefined
								: (selected as "adaptive" | "disabled"),
					});
				}}
				variant="secondary"
				fullWidth
			>
				<Label>Thinking</Label>
				<Select.Trigger>
					<Select.Value />
					<Select.Indicator />
				</Select.Trigger>
				<Description>
					Adaptive lets the model decide how much to think per request
				</Description>
				<Select.Popover>
					<ListBox>
						<ListBox.Item id={UNSET} textValue="Not set">
							Not set
						</ListBox.Item>
						<ListBox.Item id="adaptive" textValue="Adaptive">
							Adaptive
						</ListBox.Item>
						<ListBox.Item id="disabled" textValue="Disabled">
							Disabled
						</ListBox.Item>
					</ListBox>
				</Select.Popover>
			</Select>
			<div className="flex flex-col gap-2 w-full">
				<Select
					placeholder="Not set"
					value={opts?.maxReasoningEffort ?? null}
					onChange={(selected) => {
						setOpts({
							...opts,
							maxReasoningEffort:
								selected === UNSET
									? undefined
									: (selected as "low" | "medium" | "high" | "xhigh" | "max"),
						});
					}}
					variant="secondary"
					fullWidth
				>
					<Label>Reasoning Effort</Label>
					<Select.Trigger>
						<Select.Value />
						<Select.Indicator />
					</Select.Trigger>
					<Select.Popover>
						<ListBox>
							<ListBox.Item id={UNSET} textValue="Not set">
								Not set
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
							<ListBox.Item id="xhigh" textValue="Extra High">
								Extra High
							</ListBox.Item>
							<ListBox.Item id="max" textValue="Max">
								Max
							</ListBox.Item>
						</ListBox>
					</Select.Popover>
				</Select>
				<p className="text-xs text-muted">
					These options apply to Claude 4.6 and newer. Extra High requires
					Claude Opus 4.7 or newer, and Disabled cannot be combined with Extra
					High or Max on Claude Opus 5.
				</p>
			</div>
			<Select
				placeholder="Not set"
				value={opts?.display ?? null}
				onChange={(selected) => {
					setOpts({
						...opts,
						display:
							selected === UNSET
								? undefined
								: (selected as "omitted" | "summarized"),
					});
				}}
				variant="secondary"
				fullWidth
			>
				<Label>Thinking Display</Label>
				<Select.Trigger>
					<Select.Value />
					<Select.Indicator />
				</Select.Trigger>
				<Description>
					Controls whether the model returns a summary of its reasoning. Takes
					effect when Thinking is Adaptive.
				</Description>
				<Select.Popover>
					<ListBox>
						<ListBox.Item id={UNSET} textValue="Not set">
							Not set
						</ListBox.Item>
						<ListBox.Item id="omitted" textValue="Omitted">
							Omitted
						</ListBox.Item>
						<ListBox.Item id="summarized" textValue="Summarized">
							Summarized
						</ListBox.Item>
					</ListBox>
				</Select.Popover>
			</Select>
		</>
	);
}

// Reasoning/thinking options; the visible controls depend on provider type.
export function ProviderOptions({
	providerType,
	value,
	onValueChange,
}: ProviderOptionsProps) {
	// Only show for providers with reasoning options
	if (
		!["openai", "xai", "azure", "google", "google-vertex", "bedrock"].includes(
			providerType,
		)
	) {
		return null;
	}

	return (
		<>
			<Separator className="my-2" />

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
										| "none"
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
						<Description>
							None skips reasoning on models that support it, such as GPT-5.6
							Luna
						</Description>
						<Select.Popover>
							<ListBox>
								<ListBox.Item id="none" textValue="None">
									None
								</ListBox.Item>
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

			{(providerType === "google" || providerType === "google-vertex") && (
				<GoogleVertexOptions
					optionsKey={providerType === "google-vertex" ? "vertex" : "google"}
					value={value}
					onValueChange={onValueChange}
				/>
			)}

			{providerType === "bedrock" && (
				<BedrockOptions value={value} onValueChange={onValueChange} />
			)}
		</>
	);
}
