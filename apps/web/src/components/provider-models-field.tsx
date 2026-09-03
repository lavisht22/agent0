import {
	Button,
	Input,
	ListBox,
	NumberField,
	Select,
	TextField,
} from "@heroui/react";
import type { ModelStatus, ProviderModel } from "@repo/models";
import { LucidePlus, LucideTrash2 } from "lucide-react";
import { FormSection } from "@/components/form-section";

interface ProviderModelsFieldProps {
	value: ProviderModel[];
	onValueChange: (value: ProviderModel[]) => void;
}

const EMPTY_MODEL: ProviderModel = {
	id: "",
	cost: { noCacheInput: 0, cacheInput: 0, output: 0 },
	status: "active",
};

const STATUSES: { id: ModelStatus; label: string }[] = [
	{ id: "active", label: "Active" },
	{ id: "deprecated", label: "Deprecated" },
	{ id: "retired", label: "Retired" },
];

// Column template shared by the header and each model row so they line up. The
// `display` utility is left to each consumer: the header is hidden on mobile,
// and pairing `hidden` with a `grid` baked in here would leave two conflicting
// display classes whose winner depends on stylesheet order.
const COLS =
	"grid-cols-1 md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_9rem_2.25rem] gap-2";

/**
 * React Aria's NumberField keeps its own text while the field is being edited,
 * so a half-typed "0." survives long enough for the decimals to be entered —
 * binding a plain input straight to the parsed number rewrites the box on every
 * keystroke and makes decimals impossible to type.
 */
function CostInput({
	label,
	value,
	onValueChange,
}: {
	label: string;
	value: number;
	onValueChange: (value: number) => void;
}) {
	return (
		<NumberField
			aria-label={label}
			value={value}
			onChange={(next) => onValueChange(Number.isFinite(next) ? next : 0)}
			minValue={0}
			fullWidth
			// Fine enough for the smallest real per-1M prices (0.005) without the
			// field snapping them to a coarser multiple.
			step={0.001}
			formatOptions={{ maximumFractionDigits: 6 }}
		>
			{/*
			 * `.number-field__group` is a grid whose tracks are fixed at
			 * `40px 1fr 40px`, holding space for the stepper buttons even when they
			 * aren't rendered. Without the buttons the input sits in the leading
			 * 40px track and the group's `overflow-hidden` clips the value after
			 * about two characters, so collapse it to a single track. Inline rather
			 * than a utility class so it wins on specificity outright.
			 */}
			<NumberField.Group style={{ gridTemplateColumns: "1fr" }}>
				<NumberField.Input />
			</NumberField.Group>
		</NumberField>
	);
}

export function ProviderModelsField({
	value,
	onValueChange,
}: ProviderModelsFieldProps) {
	const models = value ?? [];

	const updateAt = (index: number, patch: Partial<ProviderModel>) => {
		onValueChange(models.map((m, i) => (i === index ? { ...m, ...patch } : m)));
	};

	const updateCostAt = (
		index: number,
		key: keyof ProviderModel["cost"],
		next: number,
	) => {
		const model = models[index];
		if (!model) return;
		updateAt(index, { cost: { ...model.cost, [key]: next } });
	};

	// A duplicate id makes the model picker ambiguous and would price the run off
	// whichever entry happened to be found first.
	const duplicateIds = new Set(
		models
			.map((m) => m.id.trim())
			.filter((id, i, all) => id !== "" && all.indexOf(id) !== i),
	);

	return (
		<FormSection
			title="Custom Models"
			description="Optional. Set these when the provider points somewhere the built-in model list doesn't describe — an OpenAI-compatible gateway, Bedrock's OpenAI-compatible endpoint, a self-hosted server. When set, they replace the built-in models for this provider. Costs are USD per 1M tokens and drive run cost reporting."
			action={
				<Button
					size="sm"
					variant="tertiary"
					onPress={() => onValueChange([...models, { ...EMPTY_MODEL }])}
				>
					<LucidePlus className="size-3" />
					Add Model
				</Button>
			}
		>
			{models.length > 0 && (
				<div className="flex flex-col gap-2">
					<div className={`hidden md:grid ${COLS} px-1`}>
						<span className="text-xs text-muted">Model ID</span>
						<span className="text-xs text-muted">Input</span>
						<span className="text-xs text-muted">Cached in</span>
						<span className="text-xs text-muted">Output</span>
						<span className="text-xs text-muted">Status</span>
						<span />
					</div>

					{models.map((model, index) => {
						const trimmed = model.id.trim();
						const isDuplicate = trimmed !== "" && duplicateIds.has(trimmed);
						return (
							<div
								// Index-keyed because a row has no stable id of its own — the
								// model id is the very thing being edited.
								// biome-ignore lint/suspicious/noArrayIndexKey: <rows are positional>
								key={index}
								className="flex flex-col gap-1"
							>
								<div className={`grid ${COLS} items-center`}>
									<TextField
										aria-label="Model ID"
										isInvalid={trimmed === "" || isDuplicate}
										value={model.id}
										onChange={(v) => updateAt(index, { id: v })}
									>
										<Input placeholder="global.openai.gpt-5.6-luna" />
									</TextField>
									<CostInput
										label="Input cost per 1M tokens"
										value={model.cost.noCacheInput}
										onValueChange={(v) =>
											updateCostAt(index, "noCacheInput", v)
										}
									/>
									<CostInput
										label="Cached input cost per 1M tokens"
										value={model.cost.cacheInput}
										onValueChange={(v) => updateCostAt(index, "cacheInput", v)}
									/>
									<CostInput
										label="Output cost per 1M tokens"
										value={model.cost.output}
										onValueChange={(v) => updateCostAt(index, "output", v)}
									/>
									<Select
										aria-label="Status"
										value={model.status ?? "active"}
										onChange={(selected) =>
											updateAt(index, { status: selected as ModelStatus })
										}
										variant="secondary"
									>
										<Select.Trigger>
											<Select.Value />
											<Select.Indicator />
										</Select.Trigger>
										<Select.Popover>
											<ListBox items={STATUSES}>
												{(s) => (
													<ListBox.Item id={s.id} textValue={s.label}>
														{s.label}
													</ListBox.Item>
												)}
											</ListBox>
										</Select.Popover>
									</Select>
									<Button
										size="sm"
										variant="tertiary"
										isIconOnly
										aria-label={`Remove ${trimmed || "model"}`}
										onPress={() =>
											onValueChange(models.filter((_, i) => i !== index))
										}
									>
										<LucideTrash2 className="size-3.5" />
									</Button>
								</div>
								{(trimmed === "" || isDuplicate) && (
									<p className="text-xs text-danger px-1">
										{trimmed === ""
											? "Model ID is required."
											: `Duplicate model ID "${trimmed}".`}
									</p>
								)}
							</div>
						);
					})}
				</div>
			)}
		</FormSection>
	);
}
