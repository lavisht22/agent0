import {
	Button,
	DateRangePicker as HeroDateRangePicker,
	Listbox,
	ListboxItem,
	Popover,
	PopoverContent,
	PopoverTrigger,
	useDisclosure,
} from "@heroui/react";
import {
	type CalendarDate,
	getLocalTimeZone,
	parseDate,
	today,
} from "@internationalized/date";
import { format } from "date-fns";
import { Calendar, ChevronDown, LucideX } from "lucide-react";
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
];

type Value = {
	datePreset?: string;
	startDate?: string;
	endDate?: string;
};

interface DateRangePickerProps {
	value: Value;
	onValueChange: (value: Value) => void;
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
 * Helper to get display label for current value
 */
function getDisplayLabel(value: Value): string {
	if (value.datePreset) {
		const preset = DATE_PRESETS.find((p) => p.key === value.datePreset);
		return preset?.label || "Select Date";
	}

	if (value.startDate && value.endDate) {
		const start = new Date(value.startDate);
		const end = new Date(value.endDate);
		return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
	}

	return "Select Date";
}

export function DateRangePicker({
	value,
	onValueChange,
}: DateRangePickerProps) {
	const { isOpen, onOpenChange } = useDisclosure();
	const [showCustom, setShowCustom] = useState(
		!!(value.startDate && value.endDate && !value.datePreset),
	);
	// Separate state to control the calendar popover
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

	const displayLabel = getDisplayLabel(value);

	if (showCustom) {
		return (
			<div className="flex gap-1 items-center">
				<HeroDateRangePicker
					size="sm"
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
				/>
				<Button
					size="sm"
					isIconOnly
					variant="light"
					onPress={() => {
						setShowCustom(false);
						setIsCalendarOpen(false);
						onValueChange({
							datePreset: "1hr",
						});
					}}
				>
					<LucideX className="size-3.5" />
				</Button>
			</div>
		);
	}

	return (
		<Popover
			placement="bottom-start"
			isOpen={isOpen}
			onOpenChange={onOpenChange}
		>
			<PopoverTrigger>
				<Button
					size="sm"
					variant="flat"
					startContent={<Calendar className="size-4" />}
					endContent={<ChevronDown className="size-4" />}
				>
					{displayLabel}
				</Button>
			</PopoverTrigger>

			<PopoverContent className="p-1">
				<Listbox
					aria-label="Date range presets"
					selectedKeys={value.datePreset ? [value.datePreset] : []}
					selectionMode="single"
				>
					{/** biome-ignore lint/complexity/noUselessFragments: <HeorUI Issue> */}
					<>
						{DATE_PRESETS.map((preset) => (
							<ListboxItem
								key={preset.key}
								onPress={() => {
									onValueChange({
										datePreset: preset.key,
									});
									onOpenChange();
								}}
							>
								{preset.label}
							</ListboxItem>
						))}
					</>

					<ListboxItem
						key="custom"
						onPress={() => {
							setShowCustom(true);
							// Auto-open the calendar when switching to custom mode
							setIsCalendarOpen(true);
							onOpenChange();
						}}
					>
						Custom...
					</ListboxItem>
				</Listbox>
			</PopoverContent>
		</Popover>
	);
}
