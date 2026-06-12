import { ListBox, Select } from "@heroui/react";
import { Layers } from "lucide-react";

export type EnvironmentFilterValue = "staging" | "production" | undefined;

interface EnvironmentFilterProps {
	value: EnvironmentFilterValue;
	onValueChange: (value: EnvironmentFilterValue) => void;
}

export function EnvironmentFilter({
	value,
	onValueChange,
}: EnvironmentFilterProps) {
	return (
		<Select
			aria-label="Filter by environment"
			placeholder="All Environments"
			className="w-44"
			value={value ?? null}
			onChange={(key) => {
				onValueChange((key as EnvironmentFilterValue) || undefined);
			}}
		>
			<Select.Trigger className="min-h-8 flex items-center gap-2">
				<Layers className="size-3.5 shrink-0 text-muted" />
				<Select.Value />
				<Select.Indicator />
			</Select.Trigger>
			<Select.Popover>
				<ListBox>
					<ListBox.Item id="production" textValue="Production">
						Production
						<ListBox.ItemIndicator />
					</ListBox.Item>
					<ListBox.Item id="staging" textValue="Staging">
						Staging
						<ListBox.ItemIndicator />
					</ListBox.Item>
				</ListBox>
			</Select.Popover>
		</Select>
	);
}
