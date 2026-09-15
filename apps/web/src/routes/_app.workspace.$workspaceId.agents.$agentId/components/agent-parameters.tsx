import { Button, Label, ListBox, NumberField, Select } from "@heroui/react";
import { LucideX } from "lucide-react";
import type { AgentFormValues } from "../types";

// One explicit model for every parameter: a param is either added (present with
// a value) or absent (omitted from the request). There are no always-on fields
// and no defaults injected on save — the agent author adds exactly what they
// want to send, and it is their responsibility that the model accepts it. Both
// the core call settings and the provider-specific reasoning options live in the
// same add/remove list.

type Option = { id: string; label: string };

type Editor =
	| { kind: "enum"; options: Option[] }
	| { kind: "number"; min?: number; step?: number; placeholder?: string }
	| { kind: "boolean" };

// Where a parameter reads/writes in the form values: either a top-level call
// setting, or a nested path under providerOptions[ns].
type Location =
	| {
			scope: "root";
			field:
				| "outputFormat"
				| "maxStepCount"
				| "temperature"
				| "maxOutputTokens";
	  }
	| { scope: "po"; ns: string; sub: string[] };

type Param = {
	key: string;
	label: string;
	description?: string;
	// Provider types that offer this parameter.
	providers: string[];
	editor: Editor;
	initial: string | number | boolean;
	location: Location;
};

const ALL_PROVIDERS = [
	"openai",
	"openai-compatible",
	"open-responses",
	"azure",
	"xai",
	"google",
	"google-vertex",
	"bedrock",
];

const EFFORT_OPENAI: Option[] = [
	{ id: "none", label: "None" },
	{ id: "minimal", label: "Minimal" },
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "xhigh", label: "Extra High" },
];

const EFFORT_XAI: Option[] = [
	{ id: "none", label: "None" },
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
	{ id: "xhigh", label: "Extra High" },
];

const THINKING_LEVEL: Option[] = [
	{ id: "minimal", label: "Minimal" },
	{ id: "low", label: "Low" },
	{ id: "medium", label: "Medium" },
	{ id: "high", label: "High" },
];

const MEDIA_RESOLUTION: Option[] = [
	{ id: "MEDIA_RESOLUTION_UNSPECIFIED", label: "Unspecified" },
	{ id: "MEDIA_RESOLUTION_LOW", label: "Low" },
	{ id: "MEDIA_RESOLUTION_MEDIUM", label: "Medium" },
	{ id: "MEDIA_RESOLUTION_HIGH", label: "High" },
];

// Google and Gemini-on-Vertex share the same thinking knobs under different
// namespaces (google vs vertex). Build one set for each.
const googleThinkingParams = (
	provider: "google" | "google-vertex",
	ns: "google" | "vertex",
): Param[] => [
	{
		key: `${ns}.thinkingLevel`,
		label: "Thinking Level",
		description: "Use with 3-series models.",
		providers: [provider],
		editor: { kind: "enum", options: THINKING_LEVEL },
		initial: "medium",
		location: { scope: "po", ns, sub: ["thinkingConfig", "thinkingLevel"] },
	},
	{
		key: `${ns}.thinkingBudget`,
		label: "Thinking Budget",
		description: "Use with 2.5-series models.",
		providers: [provider],
		editor: { kind: "number", min: 0, placeholder: "e.g. 8192" },
		initial: 8192,
		location: { scope: "po", ns, sub: ["thinkingConfig", "thinkingBudget"] },
	},
	{
		key: `${ns}.includeThoughts`,
		label: "Include Thoughts",
		providers: [provider],
		editor: { kind: "boolean" },
		initial: true,
		location: { scope: "po", ns, sub: ["thinkingConfig", "includeThoughts"] },
	},
	{
		key: `${ns}.mediaResolution`,
		label: "Media Resolution",
		providers: [provider],
		editor: { kind: "enum", options: MEDIA_RESOLUTION },
		initial: "MEDIA_RESOLUTION_MEDIUM",
		location: { scope: "po", ns, sub: ["mediaResolution"] },
	},
];

const CATALOG: Param[] = [
	// Core call settings (all providers).
	{
		key: "temperature",
		label: "Temperature",
		providers: ALL_PROVIDERS,
		editor: { kind: "number", min: 0, step: 0.1, placeholder: "e.g. 0.7" },
		initial: 1,
		location: { scope: "root", field: "temperature" },
	},
	{
		key: "maxOutputTokens",
		label: "Max Output Tokens",
		providers: ALL_PROVIDERS,
		editor: { kind: "number", min: 0, placeholder: "e.g. 2048" },
		initial: 1024,
		location: { scope: "root", field: "maxOutputTokens" },
	},
	{
		key: "maxStepCount",
		label: "Max Step Count",
		description: "Cap on agent tool-use steps. Defaults to 10 when unset.",
		providers: ALL_PROVIDERS,
		editor: { kind: "number", min: 1, placeholder: "10" },
		initial: 10,
		location: { scope: "root", field: "maxStepCount" },
	},
	{
		key: "outputFormat",
		label: "Output Format",
		description: "Defaults to Text when unset.",
		providers: ALL_PROVIDERS,
		editor: {
			kind: "enum",
			options: [
				{ id: "text", label: "Text" },
				{ id: "json", label: "JSON" },
			],
		},
		initial: "text",
		location: { scope: "root", field: "outputFormat" },
	},

	// OpenAI + Azure (openai namespace).
	{
		key: "openai.reasoningEffort",
		label: "Reasoning Effort",
		description: "None skips reasoning on models that support it.",
		providers: ["openai", "azure"],
		editor: { kind: "enum", options: EFFORT_OPENAI },
		initial: "medium",
		location: { scope: "po", ns: "openai", sub: ["reasoningEffort"] },
	},
	{
		key: "openai.reasoningSummary",
		label: "Reasoning Summary",
		providers: ["openai", "azure"],
		editor: {
			kind: "enum",
			options: [
				{ id: "auto", label: "Auto (condensed)" },
				{ id: "detailed", label: "Detailed" },
			],
		},
		initial: "auto",
		location: { scope: "po", ns: "openai", sub: ["reasoningSummary"] },
	},

	// OpenAI-compatible (Chat Completions) gateways (openaiCompatible namespace).
	{
		key: "openaiCompatible.reasoningEffort",
		label: "Reasoning Effort",
		description:
			"Forwarded as reasoning_effort; supported values vary by model.",
		providers: ["openai-compatible"],
		editor: { kind: "enum", options: EFFORT_OPENAI },
		initial: "medium",
		location: { scope: "po", ns: "openaiCompatible", sub: ["reasoningEffort"] },
	},

	// Open Responses (Responses API) gateways (openResponses namespace).
	{
		key: "openResponses.reasoningEffort",
		label: "Reasoning Effort",
		description: "Sent as reasoning.effort; works alongside function tools.",
		providers: ["open-responses"],
		editor: { kind: "enum", options: EFFORT_OPENAI },
		initial: "medium",
		location: { scope: "po", ns: "openResponses", sub: ["reasoningEffort"] },
	},
	{
		key: "openResponses.reasoningSummary",
		label: "Reasoning Summary",
		providers: ["open-responses"],
		editor: {
			kind: "enum",
			options: [
				{ id: "auto", label: "Auto (condensed)" },
				{ id: "detailed", label: "Detailed" },
			],
		},
		initial: "auto",
		location: { scope: "po", ns: "openResponses", sub: ["reasoningSummary"] },
	},

	// xAI (xai namespace).
	{
		key: "xai.reasoningEffort",
		label: "Reasoning Effort",
		providers: ["xai"],
		editor: { kind: "enum", options: EFFORT_XAI },
		initial: "medium",
		location: { scope: "po", ns: "xai", sub: ["reasoningEffort"] },
	},

	// Google / Vertex thinking config.
	...googleThinkingParams("google", "google"),
	...googleThinkingParams("google-vertex", "vertex"),

	// Amazon Bedrock (Anthropic models) reasoning config.
	{
		key: "bedrock.type",
		label: "Thinking",
		description:
			"Adaptive lets the model decide how much to think per request.",
		providers: ["bedrock"],
		editor: {
			kind: "enum",
			options: [
				{ id: "adaptive", label: "Adaptive" },
				{ id: "disabled", label: "Disabled" },
			],
		},
		initial: "adaptive",
		location: { scope: "po", ns: "bedrock", sub: ["reasoningConfig", "type"] },
	},
	{
		key: "bedrock.maxReasoningEffort",
		label: "Reasoning Effort",
		description: "Applies to Claude 4.6+. Extra High needs Opus 4.7+.",
		providers: ["bedrock"],
		editor: {
			kind: "enum",
			options: [
				{ id: "low", label: "Low" },
				{ id: "medium", label: "Medium" },
				{ id: "high", label: "High" },
				{ id: "xhigh", label: "Extra High" },
				{ id: "max", label: "Max" },
			],
		},
		initial: "medium",
		location: {
			scope: "po",
			ns: "bedrock",
			sub: ["reasoningConfig", "maxReasoningEffort"],
		},
	},
	{
		key: "bedrock.display",
		label: "Thinking Display",
		description: "Returns a reasoning summary. Takes effect when Adaptive.",
		providers: ["bedrock"],
		editor: {
			kind: "enum",
			options: [
				{ id: "omitted", label: "Omitted" },
				{ id: "summarized", label: "Summarized" },
			],
		},
		initial: "summarized",
		location: {
			scope: "po",
			ns: "bedrock",
			sub: ["reasoningConfig", "display"],
		},
	},
];

type POValue = Record<string, unknown>;

const readPath = (obj: unknown, path: string[]): unknown =>
	path.reduce<unknown>(
		(cur, key) =>
			cur != null && typeof cur === "object"
				? (cur as Record<string, unknown>)[key]
				: undefined,
		obj,
	);

// Immutable set at a nested path, creating intermediate objects.
const deepSet = (
	obj: POValue | undefined,
	path: string[],
	value: unknown,
): POValue => {
	const [head, ...rest] = path;
	const next: POValue = { ...(obj ?? {}) };
	next[head] =
		rest.length === 0
			? value
			: deepSet(next[head] as POValue | undefined, rest, value);
	return next;
};

// Immutable delete at a nested path, pruning parents left empty.
const deepUnset = (obj: POValue | undefined, path: string[]): POValue => {
	const [head, ...rest] = path;
	if (obj == null || !(head in obj)) return obj ?? {};
	const next: POValue = { ...obj };
	if (rest.length === 0) {
		delete next[head];
		return next;
	}
	const child = deepUnset(next[head] as POValue | undefined, rest);
	if (Object.keys(child).length === 0) delete next[head];
	else next[head] = child;
	return next;
};

const getValue = (values: AgentFormValues, p: Param): unknown =>
	p.location.scope === "root"
		? values[p.location.field]
		: readPath(values.providerOptions, [p.location.ns, ...p.location.sub]);

const isPresent = (values: AgentFormValues, p: Param): boolean =>
	getValue(values, p) !== undefined;

interface AgentParametersProps {
	providerType: string | undefined;
	values: AgentFormValues;
	onChange: (patch: Partial<AgentFormValues>) => void;
}

export function AgentParameters({
	providerType,
	values,
	onChange,
}: AgentParametersProps) {
	if (!providerType) {
		return (
			<p className="text-sm text-muted">
				Select a model to configure parameters.
			</p>
		);
	}

	const applicable = CATALOG.filter((p) => p.providers.includes(providerType));
	const added = applicable.filter((p) => isPresent(values, p));
	const available = applicable.filter((p) => !isPresent(values, p));

	const setValue = (p: Param, value: unknown) => {
		if (p.location.scope === "root") {
			onChange({ [p.location.field]: value } as Partial<AgentFormValues>);
		} else {
			const path = [p.location.ns, ...p.location.sub];
			onChange({
				providerOptions: deepSet(
					values.providerOptions as POValue | undefined,
					path,
					value,
				) as AgentFormValues["providerOptions"],
			});
		}
	};

	const removeValue = (p: Param) => {
		if (p.location.scope === "root") {
			onChange({ [p.location.field]: undefined } as Partial<AgentFormValues>);
		} else {
			const path = [p.location.ns, ...p.location.sub];
			onChange({
				providerOptions: deepUnset(
					values.providerOptions as POValue | undefined,
					path,
				) as AgentFormValues["providerOptions"],
			});
		}
	};

	return (
		<div className="flex flex-col gap-3 w-full">
			{added.length === 0 && (
				<p className="text-sm text-muted">
					No parameters set. Add one below to send it with each run.
				</p>
			)}

			{added.map((p) => (
				<div key={p.key} className="flex items-start gap-2 w-full">
					<div className="flex-1 min-w-0">
						<ParamEditor
							param={p}
							value={getValue(values, p)}
							onValueChange={(v) => setValue(p, v)}
						/>
					</div>
					<Button
						size="sm"
						variant="tertiary"
						aria-label={`Remove ${p.label}`}
						onPress={() => removeValue(p)}
						className="mt-6"
					>
						<LucideX className="size-4" />
					</Button>
				</div>
			))}

			{added.length > 0 && available.length > 0 && (
				<div className="border-t border-dashed border-border" />
			)}

			{available.length > 0 && (
				<Select
					aria-label="Add parameter"
					placeholder="Add parameter"
					// Acts as a menu: pick an item to add it, then reset to unselected.
					value={null}
					onChange={(selected) => {
						const p = available.find((x) => x.key === selected);
						if (p) setValue(p, p.initial);
					}}
					variant="secondary"
					fullWidth
				>
					<Select.Trigger>
						<Select.Value />
						<Select.Indicator />
					</Select.Trigger>
					<Select.Popover>
						<ListBox items={available}>
							{(p) => (
								<ListBox.Item id={p.key} textValue={p.label}>
									{p.label}
								</ListBox.Item>
							)}
						</ListBox>
					</Select.Popover>
				</Select>
			)}
		</div>
	);
}

function ParamEditor({
	param,
	value,
	onValueChange,
}: {
	param: Param;
	value: unknown;
	onValueChange: (value: unknown) => void;
}) {
	const { editor, label, description } = param;

	if (editor.kind === "boolean") {
		// Rendered as a Yes/No select for visual parity with the other editors,
		// but the stored value stays a real boolean.
		return (
			<Select
				value={value === true ? "true" : value === false ? "false" : null}
				onChange={(selected) => onValueChange(selected === "true")}
				variant="secondary"
				fullWidth
			>
				<Label>{label}</Label>
				<Select.Trigger>
					<Select.Value />
					<Select.Indicator />
				</Select.Trigger>
				{description && (
					<p className="text-xs text-muted mt-1">{description}</p>
				)}
				<Select.Popover>
					<ListBox>
						<ListBox.Item id="true" textValue="Yes">
							Yes
						</ListBox.Item>
						<ListBox.Item id="false" textValue="No">
							No
						</ListBox.Item>
					</ListBox>
				</Select.Popover>
			</Select>
		);
	}

	if (editor.kind === "number") {
		return (
			<NumberField
				minValue={editor.min}
				step={editor.step}
				// NaN is React Aria's empty-value sentinel.
				value={typeof value === "number" ? value : Number.NaN}
				onChange={(v) => onValueChange(Number.isNaN(v) ? undefined : v)}
				variant="secondary"
				fullWidth
			>
				<Label>{label}</Label>
				<NumberField.Group>
					<NumberField.DecrementButton />
					<NumberField.Input placeholder={editor.placeholder} />
					<NumberField.IncrementButton />
				</NumberField.Group>
			</NumberField>
		);
	}

	return (
		<Select
			value={(value as string) ?? null}
			onChange={(selected) => onValueChange(selected)}
			variant="secondary"
			fullWidth
		>
			<Label>{label}</Label>
			<Select.Trigger>
				<Select.Value />
				<Select.Indicator />
			</Select.Trigger>
			{description && <p className="text-xs text-muted mt-1">{description}</p>}
			<Select.Popover>
				<ListBox items={editor.options}>
					{(opt) => (
						<ListBox.Item id={opt.id} textValue={opt.label}>
							{opt.label}
						</ListBox.Item>
					)}
				</ListBox>
			</Select.Popover>
		</Select>
	);
}
