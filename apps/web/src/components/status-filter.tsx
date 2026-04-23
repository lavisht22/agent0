import { ListBox, Select } from "@heroui/react";
import { Activity } from "lucide-react";

export type StatusFilterValue = "success" | "failed" | undefined;

interface StatusFilterProps {
	value: StatusFilterValue;
	onValueChange: (value: StatusFilterValue) => void;
}

export function StatusFilter({ value, onValueChange }: StatusFilterProps) {
	return (
		<Select
			aria-label="Filter by status"
			placeholder="All Statuses"
			className="w-40"
			value={value ?? null}
			onChange={(key) => {
				onValueChange((key as StatusFilterValue) || undefined);
			}}
		>
			<Select.Trigger className="min-h-8">
				<Activity className="size-3.5 shrink-0" />
				<Select.Value />
				<Select.Indicator />
			</Select.Trigger>
			<Select.Popover>
				<ListBox>
					<ListBox.Item id="success" textValue="Success">
						Success
						<ListBox.ItemIndicator />
					</ListBox.Item>
					<ListBox.Item id="failed" textValue="Failed" variant="danger">
						Failed
						<ListBox.ItemIndicator />
					</ListBox.Item>
				</ListBox>
			</Select.Popover>
		</Select>
	);
}
