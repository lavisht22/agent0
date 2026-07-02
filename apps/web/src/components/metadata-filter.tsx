import { Button, Chip, Input, Popover } from "@heroui/react";
import { Tags, X } from "lucide-react";
import { useState } from "react";

interface MetadataFilterProps {
	/** Active key→value pairs currently applied as a filter. */
	value: Record<string, string>;
	onValueChange: (value: Record<string, string>) => void;
}

/**
 * Popover filter for run metadata. Users add one or more `key=value` pairs;
 * runs must contain all of them (server-side jsonb containment). Matches the
 * toolbar filter styling used by the other run filters.
 */
export function MetadataFilter({ value, onValueChange }: MetadataFilterProps) {
	const [keyDraft, setKeyDraft] = useState("");
	const [valueDraft, setValueDraft] = useState("");

	const pairs = Object.entries(value);
	const count = pairs.length;

	const addPair = () => {
		const key = keyDraft.trim();
		if (!key) return;
		onValueChange({ ...value, [key]: valueDraft });
		setKeyDraft("");
		setValueDraft("");
	};

	const removePair = (key: string) => {
		const next = { ...value };
		delete next[key];
		onValueChange(next);
	};

	return (
		<Popover>
			<Popover.Trigger className="relative isolate inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-field border border-[var(--color-field-border)] bg-field py-1.5 pl-3 pr-3 text-sm text-field-foreground shadow-field outline-none transition hover:bg-field-hover">
				<Tags className="size-3.5 shrink-0 text-muted" />
				<span className={count === 0 ? "text-muted" : undefined}>
					{count === 0 ? "Metadata" : `Metadata (${count})`}
				</span>
			</Popover.Trigger>
			<Popover.Content placement="bottom start">
				<Popover.Dialog className="flex w-72 flex-col gap-3 p-3">
					{count > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{pairs.map(([k, v]) => (
								<Chip key={k} variant="soft" size="sm">
									<span className="font-medium">{k}</span>
									<span className="text-muted">=</span>
									<span>{v}</span>
									<button
										type="button"
										aria-label={`Remove ${k}`}
										className="ml-0.5 cursor-pointer text-muted hover:text-foreground"
										onClick={() => removePair(k)}
									>
										<X className="size-3" />
									</button>
								</Chip>
							))}
						</div>
					)}
					<div className="flex items-center gap-2">
						<Input
							aria-label="Metadata key"
							placeholder="key"
							className="min-h-8"
							value={keyDraft}
							onChange={(e) => setKeyDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") addPair();
							}}
						/>
						<Input
							aria-label="Metadata value"
							placeholder="value"
							className="min-h-8"
							value={valueDraft}
							onChange={(e) => setValueDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") addPair();
							}}
						/>
					</div>
					<div className="flex justify-between gap-2">
						{count > 0 ? (
							<Button
								size="sm"
								variant="tertiary"
								onPress={() => onValueChange({})}
							>
								Clear all
							</Button>
						) : (
							<span />
						)}
						<Button size="sm" onPress={addPair} isDisabled={!keyDraft.trim()}>
							Add filter
						</Button>
					</div>
				</Popover.Dialog>
			</Popover.Content>
		</Popover>
	);
}
