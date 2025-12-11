import {
	Button,
	DateRangePicker as HeroDateRangePicker,
	Select,
	SelectItem,
} from "@heroui/react";
import {
	type CalendarDate,
	getLocalTimeZone,
	parseDate,
	today,
} from "@internationalized/date";
import { format } from "date-fns";
import { LucideArrowLeft, LucideCalendar } from "lucide-react";
import { useMemo, useState } from "react";

const DATE_PRESETS = [
	{
		key: "15min",
		label: "Last 15 Minutes",
	},
	{
		key: "1hr",
		label: "Last Hour",
	},
	{
		key: "24hr",
		label: "Last 24 Hours",
	},
	{
		key: "yesterday",
		label: "Yesterday",
	},
	{
		key: "3days",
		label: "Last 3 Days",
	},
	{
		key: "7days",
		label: "Last 7 Days",
	},
	{
		key: "custom",
		label: "Custom...",
	},
];

export type DateRangeValue = {
	datePreset?: string;
	startDate?: string;
	endDate?: string;
};

interface DateRangePickerProps {
	value: DateRangeValue;
	onValueChange: (value: DateRangeValue) => void;
}

/**
 * Helper to compute from/to ISO dates based on a preset key
 */
export function computeDateRangeFromPreset(
	presetKey: string,
): { from: string; to: string } | null {
	const now = new Date();
	let fromDate: Date;
	const toDate = now;

	switch (presetKey) {
		case "15min":
			fromDate = new Date(now.getTime() - 15 * 60 * 1000);
			break;
		case "1hr":
			fromDate = new Date(now.getTime() - 60 * 60 * 1000);
			break;
		case "24hr":
			fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
			break;
		case "yesterday": {
			const yesterday = new Date(now);
			yesterday.setDate(yesterday.getDate() - 1);
			yesterday.setHours(0, 0, 0, 0);
			fromDate = yesterday;
			const endOfYesterday = new Date(yesterday);
			endOfYesterday.setHours(23, 59, 59, 999);
			return {
				from: fromDate.toISOString(),
				to: endOfYesterday.toISOString(),
			};
		}
		case "3days":
			fromDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
			break;
		case "7days":
			fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			break;
		default:
			return null;
	}

	return {
		from: fromDate.toISOString(),
		to: toDate.toISOString(),
	};
}

/**
 * Helper to get display label for custom date range
 */
function getCustomDateLabel(value: DateRangeValue): string {
	if (value.startDate && value.endDate) {
		const start = new Date(value.startDate);
		const end = new Date(value.endDate);
		return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
	}
	return "Custom...";
}

export function DateRangePicker({
	value,
	onValueChange,
}: DateRangePickerProps) {
	const [showCustom, setShowCustom] = useState(
		!!(value.startDate && value.endDate && !value.datePreset),
	);
	const [isCalendarOpen, setIsCalendarOpen] = useState(false);

	// Convert custom date strings to CalendarDate for HeroDateRangePicker
	const customDateValue = useMemo(() => {
		if (value.startDate && value.endDate) {
			try {
				const startStr = value.startDate.split("T")[0];
				const endStr = value.endDate.split("T")[0];
				return {
					start: parseDate(startStr),
					end: parseDate(endStr),
				};
			} catch {
				return null;
			}
		}
		return null;
	}, [value.startDate, value.endDate]);

	// Determine selected key for the Select
	const selectedKey = value.datePreset || (showCustom ? "custom" : undefined);

	if (showCustom) {
		return (
			<HeroDateRangePicker
				variant="bordered"
				size="sm"
				className="w-64"
				aria-label="Select date range"
				value={customDateValue}
				maxValue={today(getLocalTimeZone())}
				isOpen={isCalendarOpen}
				onOpenChange={setIsCalendarOpen}
				onChange={(
					range: { start: CalendarDate; end: CalendarDate } | null,
				) => {
					if (range) {
						// Convert CalendarDate to ISO string for start of day / end of day
						const startDate = range.start.toDate(getLocalTimeZone());
						startDate.setHours(0, 0, 0, 0);

						const endDate = range.end.toDate(getLocalTimeZone());
						endDate.setHours(23, 59, 59, 999);

						onValueChange({
							startDate: startDate.toISOString(),
							endDate: endDate.toISOString(),
						});
					}
				}}
				CalendarTopContent={
					<div className="p-2">
						<Button
							fullWidth
							variant="light"
							size="sm"
							onPress={() => {
								setShowCustom(false);
								setIsCalendarOpen(false);
								onValueChange({
									datePreset: "1hr",
								});
							}}
							startContent={<LucideArrowLeft className="size-3.5" />}
						>
							Back to Presets
						</Button>
					</div>
				}
			/>
		);
	}

	return (
		<Select
			startContent={<LucideCalendar className="size-3.5" />}
			variant="bordered"
			aria-label="Filter by date range"
			placeholder="Select Date"
			size="sm"
			classNames={{
				base: "w-44",
				popoverContent: "w-[200px]",
			}}
			selectedKeys={selectedKey ? [selectedKey] : []}
			onSelectionChange={(keys) => {
				const key = Array.from(keys)[0] as string | undefined;
				if (key === "custom") {
					setShowCustom(true);
					setIsCalendarOpen(true);
				} else if (key) {
					onValueChange({
						datePreset: key,
					});
				}
			}}
			renderValue={(items) => {
				const item = items[0];
				if (!item) return "Select Date";

				// For custom with dates selected, show the date range
				if (item.key === "custom" && value.startDate && value.endDate) {
					return getCustomDateLabel(value);
				}

				return item.textValue;
			}}
		>
			{DATE_PRESETS.map((preset) => (
				<SelectItem key={preset.key}>{preset.label}</SelectItem>
			))}
		</Select>
	);
}
